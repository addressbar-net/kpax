/**
 * addressbar.net — Real-Time Room Chat & Dual-Window Rate Limiting Engine
 * 
 * Enforces:
 * 1. 3 chats per minute limit:
 *    - Starts at "0/3"
 *    - Increments to "1/3" upon first submission
 *    - Resets to 0 exactly 1 minute (60,000ms) after the first message when count was 0
 *    - Allows up to 2 additional messages during that minute window
 * 2. 15 chats per hour limit:
 *    - Displays "0/15" next to "0/3"
 *    - Starts hourly record upon first submitted chat when count was 0/15
 *    - Resets to 0 exactly 1 hour (3,600,000ms) after the first message when count was 0/15
 *    - Allows up to 15 total chat messages submitted in that hour window
 * 3. Broadcasts submitted messages to all players in the room via WebSocket server
 */

class ChatUIController {
    constructor() {
        this.minuteLimit = 3;
        this.hourLimit = 45;
        this.maxUsernameLength = 13;
        this.maxLineLength = 35;
        this.maxMessageLength = 70;

        this.minuteCount = 0;
        this.firstMinuteTime = null;

        this.hourCount = 0;
        this.firstHourTime = null;

        this.isRegistered = false;
        this.username = '?';
        this.hidePlayerName = (localStorage.getItem('dw_hide_player_name') === 'true');

        this.isMinimized = false;
        this.isPhoneOpen = false;
        this.isTextMessageToolOpen = false;
        this._ignoreOpeningKeyRepeat = false;
        this.isSubmenuOpen = false;
        this.submenuSelectedIndex = 0;
        this.characterDisplayNameEl = null;
        this.notificationsEnabled = (localStorage.getItem('dw_chat_notifications') !== 'false');
        this.notifTimer = null;
        this.lastChatMessage = null;
        try {
            localStorage.removeItem('dw_last_chat_message');
        } catch (e) {}

        this.dom = {};
        this.localSpeechBubble = null;

        this.loadSavedLimits();
        this.initDOM();
        this.bindEvents();
        this.startTicker();
    }

    /**
     * Resolves the sign up / log in URL dynamically.
     * Always targets signup.html of the active host page/domain from which the game was served.
     */
    getSignupUrl() {
        if (typeof window.getAuthSignupUrl === 'function') {
            return window.getAuthSignupUrl();
        }

        let baseHref = '';
        try {
            if (window.parentPageUrl) {
                baseHref = window.parentPageUrl;
            } else if (window.top && window.top.location && window.top.location.href && !window.top.location.href.startsWith('about:')) {
                baseHref = window.top.location.href;
            } else if (window.parent && window.parent.location && window.parent.location.href && !window.parent.location.href.startsWith('about:')) {
                baseHref = window.parent.location.href;
            } else if (window.location && window.location.href && !window.location.href.startsWith('about:')) {
                baseHref = window.location.href;
            }
        } catch (e) {}

        if (baseHref) {
            try {
                const targetUrl = new URL('signup.html', baseHref);
                targetUrl.searchParams.set('redirect', baseHref);
                return targetUrl.href;
            } catch (e) {}
        }

        // Fallback using document.referrer or window.location.origin
        try {
            if (document.referrer && !document.referrer.startsWith('about:')) {
                const refUrl = new URL('signup.html', document.referrer);
                refUrl.searchParams.set('redirect', document.referrer);
                return refUrl.href;
            }
        } catch (e) {}

        let origin = '';
        try {
            origin = (window.parentPageOrigin) ? window.parentPageOrigin : (window.location.origin || (window.location.protocol + '//' + window.location.host));
        } catch (e) {}

        return origin ? `${origin}/signup.html` : 'signup.html';
    }

    /**
     * Loads persisted rate limit state from localStorage if not expired.
     */
    loadSavedLimits() {
        try {
            const raw = localStorage.getItem('dw_chat_rate_limits');
            if (raw) {
                const data = JSON.parse(raw);
                const now = Date.now();

                if (data.firstMinuteTime && (now - data.firstMinuteTime < 60000)) {
                    this.minuteCount = Math.min(this.minuteLimit, Number(data.minuteCount) || 0);
                    this.firstMinuteTime = Number(data.firstMinuteTime);
                } else {
                    this.minuteCount = 0;
                    this.firstMinuteTime = null;
                }

                if (data.firstHourTime && (now - data.firstHourTime < 3600000)) {
                    this.hourCount = Math.min(this.hourLimit, Number(data.hourCount) || 0);
                    this.firstHourTime = Number(data.firstHourTime);
                } else {
                    this.hourCount = 0;
                    this.firstHourTime = null;
                }
            }
        } catch (e) {
            this.minuteCount = 0;
            this.firstMinuteTime = null;
            this.hourCount = 0;
            this.firstHourTime = null;
        }
    }

    /**
     * Persists current rate limit state to localStorage.
     */
    saveLimits() {
        try {
            localStorage.setItem('dw_chat_rate_limits', JSON.stringify({
                minuteCount: this.minuteCount,
                firstMinuteTime: this.firstMinuteTime,
                hourCount: this.hourCount,
                firstHourTime: this.firstHourTime
            }));
        } catch (e) {}
    }

    formatUsername(rawName) {
        const maxLen = this.maxUsernameLength || 13;
        return String(rawName || '?').slice(0, maxLen);
    }

    loadLastChatMessage() {
        return null;
    }

    saveLastChatMessage(author, message, room) {
        const cleanMsg = String(message || '').slice(0, this.maxMessageLength);
        this.lastChatMessage = {
            author: this.formatUsername(author || '?'),
            message: cleanMsg,
            room: room || 'world'
        };
    }

    /**
     * Splits a text message (max 70 characters) onto at most 2 lines of max 35 characters each.
     * - If <= 35 characters, stays on line 1.
     * - If > 35 characters, tries to split at the last space before index 35 so a whole word fits on line 2.
     * - If there isn't enough room on line 2 (> 35 chars) or no space exists, splits the word at 35 characters
     *   and appends a hyphen '-' (producing up to 71 total characters for a 70-character message).
     */
    formatMessageLines(rawText) {
        const maxLine = this.maxLineLength || 35;
        const maxTotal = this.maxMessageLength || 70;
        const text = String(rawText || '').slice(0, maxTotal);

        if (text.length <= maxLine) {
            return {
                line1: text,
                line2: '',
                lines: [text, ''],
                formatted: text,
                totalChars: text.length,
                hyphenated: false
            };
        }

        // Clean word boundary right at the 35-character mark
        if (text[maxLine] === ' ') {
            const line1 = text.slice(0, maxLine);
            const line2 = text.slice(maxLine + 1, maxLine + 1 + maxLine);
            return {
                line1,
                line2,
                lines: [line1, line2],
                formatted: line2 ? `${line1}\n${line2}` : line1,
                totalChars: line1.length + line2.length,
                hyphenated: false
            };
        }

        // Try splitting at the last space within the first 35 characters so a whole word moves to line 2
        const lastSpace = text.lastIndexOf(' ', maxLine);
        if (lastSpace > 0) {
            const candidateLine1 = text.slice(0, lastSpace);
            const candidateLine2 = text.slice(lastSpace + 1);
            if (candidateLine2.length <= maxLine) {
                return {
                    line1: candidateLine1,
                    line2: candidateLine2,
                    lines: [candidateLine1, candidateLine2],
                    formatted: `${candidateLine1}\n${candidateLine2}`,
                    totalChars: candidateLine1.length + candidateLine2.length,
                    hyphenated: false
                };
            }
        }

        // Not enough room on line 2 to fit the whole word: split the word and append a hyphen '-'
        const line1 = text.slice(0, maxLine) + '-';
        const line2 = text.slice(maxLine, maxTotal);
        return {
            line1,
            line2,
            lines: [line1, line2],
            formatted: `${line1}\n${line2}`,
            totalChars: line1.length + line2.length,
            hyphenated: true
        };
    }

    splitMessageIntoLines(rawText) {
        return this.formatMessageLines(rawText);
    }

    renderMessageLinesIntoElement(msgEl, rawMessage) {
        if (!msgEl) return null;
        const split = this.formatMessageLines(rawMessage);
        if (msgEl.dataset) {
            msgEl.dataset.line1 = split.line1;
            msgEl.dataset.line2 = split.line2;
            msgEl.dataset.hyphenated = split.hyphenated ? 'true' : 'false';
        }
        const l1Html = this.escapeHtml(split.line1);
        const l2Html = this.escapeHtml(split.line2);
        const sep = split.line2 ? '\n' : '';
        msgEl.innerHTML = `<div id="notif-toast-line-1" class="notif-toast-line">${l1Html}</div>${sep}<div id="notif-toast-line-2" class="notif-toast-line">${l2Html}</div>`;
        return split;
    }

    renderMessageLinesIntoToolElement(rawMessage) {
        const msgEl = (this.dom && this.dom.textMsgToolMsg) || document.getElementById('text-msg-tool-msg');
        if (!msgEl) return null;
        const split = this.formatMessageLines(rawMessage);
        if (msgEl.dataset) {
            msgEl.dataset.line1 = split.line1;
            msgEl.dataset.line2 = split.line2;
            msgEl.dataset.hyphenated = split.hyphenated ? 'true' : 'false';
        }
        const l1Html = this.escapeHtml(split.line1);
        const l2Html = this.escapeHtml(split.line2);
        const sep = split.line2 ? '\n' : '';
        msgEl.innerHTML = `<div id="text-msg-tool-line-1" class="notif-toast-line">${l1Html}</div>${sep}<div id="text-msg-tool-line-2" class="notif-toast-line">${l2Html}</div>`;
        return split;
    }

    initDOM() {
        const overlay = document.getElementById('cell-phone-menu-overlay');
        const screenContainer = document.getElementById('game-screen-container') || document.body;

        let container = overlay || document.getElementById('chat-widget-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'chat-widget-container';
            container.className = 'cell-phone-device hidden';
            screenContainer.appendChild(container);
        }

        const signupUrl = this.getSignupUrl();

        if (!container.querySelector('.phone-screen')) {
            container.innerHTML = `
            <div class="phone-case">
                <div id="chat-header" class="phone-header">
                    <div class="phone-title-group">
                        <span class="phone-status-icon">📱</span>
                        <span class="phone-title">CELL PHONE</span>
                        <span id="chat-room-badge" class="phone-room-badge">world</span>
                        <span id="chat-account-badge" class="phone-account-badge" style="display: none;"></span>
                    </div>
                    <div class="phone-header-actions">
                        <button id="phone-notif-btn" class="phone-notif-btn" type="button" title="Toggle Room Chat Notifications">🔔 NOTIFS: ON</button>
                        <button id="phone-close-btn" class="phone-close-btn" type="button" title="Close Cell Phone">✖</button>
                    </div>
                </div>

                <div class="phone-screen">
                    <div class="phone-status-strip">
                        <div id="chat-rate-counters" class="phone-rate-counters" title="Chat Limits: 3 per minute | 45 per hour">
                            <span id="chat-counter-min" class="phone-counter-badge">0/3m</span>
                            <span id="chat-counter-hour" class="phone-counter-badge">0/45h</span>
                        </div>
                        <span class="phone-signal-icons">📶 🔋</span>
                        <a id="chat-auth-link" class="phone-auth-link" href="#" target="_self">[ Log In ]</a>
                    </div>

                    <div id="chat-messages-log" class="chat-messages-log" tabindex="-1">
                        <div class="chat-system-message">
                            <span class="chat-sys-tag">PHONE</span>
                            <span>Cell phone connected. Press Enter to send, Tab to open menu.</span>
                        </div>
                    </div>

                    <form id="chat-input-form" class="chat-input-form" autocomplete="off">
                        <div class="chat-status-bar">
                            <span id="chat-status-counters" class="chat-status-counters">
                                <span id="chat-bar-min">0/3m</span>
                                <span id="chat-bar-hour">0/45h</span>
                            </span>
                            <span id="chat-cooldown-timer" class="chat-cooldown-timer"></span>
                        </div>
                        <div class="chat-input-row">
                            <input 
                                id="chat-input" 
                                type="text" 
                                placeholder="Type message..." 
                                maxlength="70" 
                                autocomplete="off" 
                                spellcheck="false"
                            />
                            <button id="chat-send-btn" type="submit" class="chat-send-btn">
                                <span>Send</span>
                            </button>
                        </div>
                    </form>
                </div>

                <!-- Tab Submenu Overlay over the chat screen -->
                <div id="chat-tab-submenu" class="chat-tab-submenu gba-start-menu-window hidden">
                    <div id="chat-tab-submenu-list" class="gba-menu-list"></div>
                </div>
            </div>
            `;
        }

        if (container.parentNode !== screenContainer) {
            screenContainer.appendChild(container);
        }

        // Text Message Tool Box right above the Room Chat Notification Box
        let textMsgToolBox = document.getElementById('text-message-tool-box');
        if (!textMsgToolBox) {
            textMsgToolBox = document.createElement('div');
            textMsgToolBox.id = 'text-message-tool-box';
            textMsgToolBox.className = 'room-chat-notification text-message-tool-box gba-description-box hidden';
            textMsgToolBox.innerHTML = `
                <div class="notif-toast-content" onclick="window.ChatUI && window.ChatUI.focusTextMessageTool()">
                    <span class="notif-toast-icon">💬</span>
                    <div class="notif-toast-body">
                        <div class="notif-toast-header">
                            <span id="text-msg-tool-author" class="notif-toast-author">?</span>
                            <span id="text-msg-tool-room" class="notif-toast-room">[world]</span>
                        </div>
                        <div id="text-msg-tool-msg" class="notif-toast-msg"><div id="text-msg-tool-line-1" class="notif-toast-line"></div><div id="text-msg-tool-line-2" class="notif-toast-line"></div></div>
                    </div>
                </div>
                <input id="text-msg-tool-input" class="text-msg-tool-input" type="text" maxlength="70" autocomplete="off" spellcheck="false" />
                <button class="notif-toast-close" type="button" onclick="event.stopPropagation(); window.ChatUI && window.ChatUI.closeTextMessageTool()" title="Close Text Message (Tab)">×</button>
            `;
            screenContainer.appendChild(textMsgToolBox);
        } else {
            textMsgToolBox.classList.toggle('hidden', !this.isTextMessageToolOpen);
        }

        // Room Chat Notification Bar at bottom of 3:2 screen area (where menu info was displayed)
        let notifToast = document.getElementById('room-chat-notification');
        if (!notifToast) {
            notifToast = document.createElement('div');
            notifToast.id = 'room-chat-notification';
            notifToast.className = `room-chat-notification gba-description-box${this.notificationsEnabled ? '' : ' hidden'}`;
            notifToast.innerHTML = `
                <div class="notif-toast-content" onclick="window.toggleCellPhone(true)">
                    <span class="notif-toast-icon">💬</span>
                    <div class="notif-toast-body">
                        <div class="notif-toast-header">
                            <span id="notif-toast-author" class="notif-toast-author">CHAT</span>
                            <span id="notif-toast-room" class="notif-toast-room">[world]</span>
                        </div>
                        <div id="notif-toast-msg" class="notif-toast-msg"><div id="notif-toast-line-1" class="notif-toast-line">No messages yet.</div><div id="notif-toast-line-2" class="notif-toast-line"></div></div>
                    </div>
                </div>
                <button class="notif-toast-close" type="button" onclick="event.stopPropagation(); window.ChatUI && window.ChatUI.toggleNotifications(false)" title="Turn Off Notifications">×</button>
            `;
            screenContainer.appendChild(notifToast);
        } else {
            notifToast.classList.toggle('hidden', !this.notificationsEnabled);
        }

        let tabSubmenu = document.getElementById('chat-tab-submenu');
        if (!tabSubmenu && container) {
            tabSubmenu = document.createElement('div');
            tabSubmenu.id = 'chat-tab-submenu';
            tabSubmenu.className = 'chat-tab-submenu gba-start-menu-window hidden';
            tabSubmenu.innerHTML = `<div id="chat-tab-submenu-list" class="gba-menu-list"></div>`;
            container.appendChild(tabSubmenu);
        }

        this.dom = {
            container,
            header: document.getElementById('chat-header'),
            roomBadge: document.getElementById('chat-room-badge'),
            authLink: document.getElementById('chat-auth-link'),
            accountBadge: document.getElementById('chat-account-badge'),
            counterMin: document.getElementById('chat-counter-min'),
            counterHour: document.getElementById('chat-counter-hour'),
            barMin: document.getElementById('chat-bar-min'),
            barHour: document.getElementById('chat-bar-hour'),
            cooldownTimer: document.getElementById('chat-cooldown-timer'),
            messagesLog: document.getElementById('chat-messages-log'),
            inputForm: document.getElementById('chat-input-form'),
            input: document.getElementById('chat-input'),
            sendBtn: document.getElementById('chat-send-btn'),
            phoneCloseBtn: document.getElementById('phone-close-btn'),
            phoneNotifBtn: document.getElementById('phone-notif-btn'),
            tabSubmenu: document.getElementById('chat-tab-submenu'),
            tabSubmenuList: document.getElementById('chat-tab-submenu-list'),
            textMsgToolBox: document.getElementById('text-message-tool-box'),
            textMsgToolAuthor: document.getElementById('text-msg-tool-author'),
            textMsgToolRoom: document.getElementById('text-msg-tool-room'),
            textMsgToolMsg: document.getElementById('text-msg-tool-msg'),
            textMsgToolInput: document.getElementById('text-msg-tool-input')
        };

        if (this.dom.input) {
            this.dom.input.maxLength = this.maxMessageLength;
            this.dom.input.setAttribute('maxlength', String(this.maxMessageLength));
        }
        if (this.dom.textMsgToolInput) {
            this.dom.textMsgToolInput.maxLength = this.maxMessageLength;
            this.dom.textMsgToolInput.setAttribute('maxlength', String(this.maxMessageLength));
        }

        this.updateAuthDisplay();
        this.updateNotifButtonDisplay();
        this.updateRoomNotificationVisibility();
        this.updateTextMessageToolMeta();
        this.updateHideNameDisplay();
        this.updateDisplay();
    }

    bindEvents() {
        // Form submit
        if (this.dom.inputForm) {
            this.dom.inputForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitMessage();
            });
        }

        // Close phone button
        if (this.dom.phoneCloseBtn) {
            this.dom.phoneCloseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleCellPhone(false);
            });
        }

        // Notifications toggle button
        if (this.dom.phoneNotifBtn) {
            this.dom.phoneNotifBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleNotifications();
            });
        }

        // In-game Log In button / link (Zero-Redirect)
        if (this.dom.authLink) {
            this.dom.authLink.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openInGameAuthModal('login');
            });
        }

        if (this.dom.accountBadge) {
            this.dom.accountBadge.style.cursor = 'pointer';
            this.dom.accountBadge.title = 'Account details / Log out';
            this.dom.accountBadge.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.isRegistered) {
                    this.openInGameUserAccountModal();
                } else {
                    this.openInGameAuthModal('login');
                }
            });
        }

        const hudLink = document.getElementById('account-hud-link');
        if (hudLink) {
            hudLink.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openInGameAuthModal('login');
            });
        }

        // Tab key interception on chat input
        if (this.dom.input) {
            this.dom.input.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggleTabSubmenu();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.dom.input.blur();
                }
            });
        }

        // Text Message Tool Box input events
        if (this.dom.textMsgToolInput) {
            this.dom.textMsgToolInput.addEventListener('input', () => {
                this.renderMessageLinesIntoToolElement(this.dom.textMsgToolInput.value);
            });
            this.dom.textMsgToolInput.addEventListener('keydown', (e) => {
                if (e.key === 'Tab' || e.code === 'Tab') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.closeTextMessageTool();
                    return;
                }
                if (this._ignoreOpeningKeyRepeat && (e.repeat || ['j', 'i', 'l', '1', '2', '3'].includes((e.key || '').toLowerCase()))) {
                    e.preventDefault();
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.submitMessage(this.dom.textMsgToolInput);
                    return;
                }
            });
            this.dom.textMsgToolInput.addEventListener('keyup', () => {
                this._ignoreOpeningKeyRepeat = false;
            });
        }

        window.addEventListener('keyup', () => {
            this._ignoreOpeningKeyRepeat = false;
        }, true);

        // Window keydown listener: Tab closes Text Message tool or toggles chat submenu
        window.addEventListener('keydown', (e) => {
            const isToolOpen = this.isTextMessageToolOpen || window.isTextMessageToolOpen;
            if (isToolOpen) {
                if (e.key === 'Tab' || e.code === 'Tab') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.closeTextMessageTool();
                    return;
                }
                if (this.dom.textMsgToolInput && document.activeElement !== this.dom.textMsgToolInput) {
                    this.dom.textMsgToolInput.focus();
                }
                return;
            }

            const isOpen = this.isPhoneOpen || window.isCellPhoneOpen;
            if (!isOpen) return;

            if (e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                this.toggleTabSubmenu();
                return;
            }

            if (this.isSubmenuOpen) {
                if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === 'e' || e.key === 'E') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.navigateSubmenu(-1);
                } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S' || e.key === 'd' || e.key === 'D') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.navigateSubmenu(1);
                } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'k' || e.key === 'K') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.selectSubmenuOption();
                }
            }
        }, true);

        // Subscribe to EventBus
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.on('chat:received', (data) => {
                this.handleIncomingChat(data);
            });

            window.EventBus.on('chat:user_status', (data) => {
                this.isRegistered = !!data.isRegistered;
                this.username = this.isRegistered ? this.formatUsername(data.username || 'User') : '?';
                if (data.hourLimit) this.hourLimit = data.hourLimit;
                if (data.minuteLimit) this.minuteLimit = data.minuteLimit;
                if (data.minuteCount !== undefined) this.minuteCount = data.minuteCount;
                if (data.hourCount !== undefined) this.hourCount = data.hourCount;
                this.updateAuthDisplay();
                this.updateDisplay();
            });

            window.EventBus.on('chat:ack', (data) => {
                if (data.hourLimit) this.hourLimit = data.hourLimit;
                if (data.minuteLimit) this.minuteLimit = data.minuteLimit;
                this.handleChatAck(data);
            });

            window.EventBus.on('chat:error', (data) => {
                if (data.hourLimit) this.hourLimit = data.hourLimit;
                if (data.minuteLimit) this.minuteLimit = data.minuteLimit;
                this.handleChatError(data);
            });

            window.EventBus.on('room:afterLoad', (data) => {
                const room = (data && data.roomName) || (window.GameState && window.GameState.currentRoom) || 'world';
                if (this.dom.roomBadge) {
                    this.dom.roomBadge.textContent = room;
                }
                this.updateTextMessageToolMeta(room);
                this.addSystemMessage(`Entered room '${room}'.`);
            });

            // Project local speech bubble & character display name in sync with camera updates
            window.EventBus.on('engine:camera', () => {
                this.updateSpeechBubblePositions();
                this.updateCharacterDisplayName();
            });

            // Re-check display name visibility when toggling first-person view
            window.EventBus.on('camera:toggleFirstPerson', () => {
                this.updateCharacterDisplayName();
            });
        }
    }

    /**
     * Resolves the target auth endpoint URL, respecting cross-domain when loaded inside addr.bar
     */
    getAuthApiUrl(action) {
        let targetHost = (window.DarkWorldMultiplayer && typeof window.DarkWorldMultiplayer.resolveLoadedHost === 'function')
            ? window.DarkWorldMultiplayer.resolveLoadedHost()
            : (window.targetServerHost || window.DARK_WORLD_WS_HOST || null);

        if (!targetHost && window.parentPageOrigin) {
            try {
                const u = new URL(window.parentPageOrigin);
                targetHost = u.hostname;
            } catch(e) {}
        }
        if (targetHost && targetHost !== window.location.hostname && targetHost !== 'addr.bar') {
            const isSecure = (window.location.protocol === 'https:' || (window.parentPageUrl && window.parentPageUrl.startsWith('https:')));
            const protocol = isSecure ? 'https:' : 'http:';
            return `${protocol}//${targetHost}/auth.php?action=${action}`;
        }
        return `auth.php?action=${action}`;
    }

    /**
     * Opens the in-game Log In / Sign Up modal without page navigation or redirect.
     */
    openInGameAuthModal(initialTab = 'login') {
        let modal = document.getElementById('in-game-auth-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'in-game-auth-modal';
            modal.className = 'in-game-auth-overlay';
            modal.innerHTML = `
                <div class="auth-dialog-card">
                    <div class="auth-dialog-titlebar">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="font-size:12px;">📱</span>
                            <span class="auth-title-text" id="auth-title-text">CELL PHONE // ACCOUNT SIGN IN</span>
                        </div>
                        <button type="button" id="auth-close-btn" class="auth-close-x">✖</button>
                    </div>
                    <div class="auth-dialog-body">
                        <div class="auth-tabs-row">
                            <button type="button" id="auth-tab-btn-login" class="auth-tab active">Log In</button>
                            <button type="button" id="auth-tab-btn-signup" class="auth-tab">Sign Up</button>
                        </div>
                        <form id="auth-dialog-form" autocomplete="off">
                            <div class="auth-field-group">
                                <label for="auth-field-user">Username (max 13 chars):</label>
                                <input type="text" id="auth-field-user" maxlength="13" placeholder="Enter username" required />
                            </div>
                            <div class="auth-field-group">
                                <label for="auth-field-pass">Password:</label>
                                <input type="password" id="auth-field-pass" placeholder="Enter password" required />
                            </div>
                            <div class="auth-field-group" id="auth-email-group" style="display: none;">
                                <label for="auth-field-email">Email (optional):</label>
                                <input type="email" id="auth-field-email" placeholder="user@example.com (optional)" />
                            </div>
                            <div id="auth-dialog-status" class="auth-status-line"></div>
                            <div class="auth-actions-row">
                                <button type="submit" id="auth-dialog-submit-btn" class="auth-btn primary">⚡ Log In</button>
                                <button type="button" id="auth-dialog-cancel-btn" class="auth-btn">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const closeBtn = modal.querySelector('#auth-close-btn');
            const cancelBtn = modal.querySelector('#auth-dialog-cancel-btn');
            const tabLogin = modal.querySelector('#auth-tab-btn-login');
            const tabSignup = modal.querySelector('#auth-tab-btn-signup');
            const form = modal.querySelector('#auth-dialog-form');
            const userInput = modal.querySelector('#auth-field-user');
            const passInput = modal.querySelector('#auth-field-pass');
            const emailInput = modal.querySelector('#auth-field-email');
            const emailGroup = modal.querySelector('#auth-email-group');
            const submitBtn = modal.querySelector('#auth-dialog-submit-btn');
            const statusLine = modal.querySelector('#auth-dialog-status');

            const closeModal = () => {
                modal.style.display = 'none';
                userInput.value = '';
                passInput.value = '';
                if (emailInput) emailInput.value = '';
                statusLine.textContent = '';
                statusLine.className = 'auth-status-line';
            };

            closeBtn.onclick = closeModal;
            cancelBtn.onclick = closeModal;

            let currentMode = 'login';
            const setMode = (mode) => {
                currentMode = mode;
                statusLine.textContent = '';
                if (mode === 'login') {
                    tabLogin.classList.add('active');
                    tabSignup.classList.remove('active');
                    emailGroup.style.display = 'none';
                    submitBtn.textContent = '⚡ Log In';
                    modal.querySelector('#auth-title-text').textContent = 'CELL PHONE // ACCOUNT SIGN IN';
                } else {
                    tabSignup.classList.add('active');
                    tabLogin.classList.remove('active');
                    emailGroup.style.display = 'block';
                    submitBtn.textContent = '✨ Create Account';
                    modal.querySelector('#auth-title-text').textContent = 'CELL PHONE // NEW ACCOUNT SIGN UP';
                }
            };

            tabLogin.onclick = () => setMode('login');
            tabSignup.onclick = () => setMode('signup');

            [userInput, passInput, emailInput].forEach(inp => {
                if (inp) {
                    inp.addEventListener('keydown', (e) => e.stopPropagation());
                    inp.addEventListener('keyup', (e) => e.stopPropagation());
                }
            });

            form.onsubmit = async (e) => {
                e.preventDefault();
                const username = (userInput.value || '').trim();
                const password = (passInput.value || '').trim();
                const email = emailInput ? (emailInput.value || '').trim() : '';

                if (!username || !password) {
                    statusLine.textContent = 'Please enter both username and password.';
                    statusLine.className = 'auth-status-line error';
                    return;
                }

                statusLine.textContent = currentMode === 'login' ? 'Signing in...' : 'Registering account...';
                statusLine.className = 'auth-status-line info';
                submitBtn.disabled = true;

                let res;
                try {
                    const endpoint = this.getAuthApiUrl(currentMode);
                    res = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: currentMode,
                            username: username,
                            password: password,
                            email: email || undefined
                        }),
                        credentials: 'include'
                    });
                } catch (netErr) {
                    console.error('[In-Game Auth Network Error]', netErr);
                    statusLine.textContent = 'Network error connecting to auth server.';
                    statusLine.className = 'auth-status-line error';
                    submitBtn.disabled = false;
                    return;
                }

                let data;
                try {
                    data = await res.json();
                } catch (parseErr) {
                    console.error('[In-Game Auth Parse Error]', parseErr);
                    statusLine.textContent = 'Invalid response from auth server.';
                    statusLine.className = 'auth-status-line error';
                    submitBtn.disabled = false;
                    return;
                }

                if (data && data.success) {
                    statusLine.textContent = `✓ Success! Signed in as ${username}.`;
                    statusLine.className = 'auth-status-line success';

                    try {
                        window.currentUser = {
                            authenticated: true,
                            id: data.user ? data.user.id : null,
                            username: username,
                            token: data.token || ''
                        };
                        if (window.GameState) {
                            window.GameState.currentUser = window.currentUser;
                        }

                        this.username = username;
                        this.isRegistered = true;
                        this.updateAuthDisplay();

                        if (window.DarkWorldMultiplayer && typeof window.DarkWorldMultiplayer.updateUserIdentity === 'function') {
                            window.DarkWorldMultiplayer.updateUserIdentity(window.currentUser);
                        } else if (typeof window.EventBus !== 'undefined') {
                            window.EventBus.emit('auth:login', window.currentUser);
                        }

                        this.addSystemMessage(`Logged in as ${username}. Rate limits upgraded.`);
                    } catch (syncErr) {
                        console.warn('[In-Game Auth Sync Warning]', syncErr);
                    }

                    setTimeout(() => {
                        closeModal();
                        submitBtn.disabled = false;
                    }, 900);
                } else {
                    statusLine.textContent = (data && data.error) ? data.error : 'Authentication failed.';
                    statusLine.className = 'auth-status-line error';
                    submitBtn.disabled = false;
                }
            };

            modal._setMode = setMode;
            modal._userInput = userInput;
        }

        modal.style.display = 'flex';
        if (modal._setMode) modal._setMode(initialTab);
        setTimeout(() => {
            if (modal._userInput) modal._userInput.focus();
        }, 50);
    }

    /**
     * Opens in-game user account modal for logging out without redirect.
     */
    openInGameUserAccountModal() {
        let modal = document.getElementById('in-game-user-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'in-game-user-modal';
            modal.className = 'in-game-auth-overlay';
            modal.innerHTML = `
                <div class="auth-dialog-card" style="max-width:320px;">
                    <div class="auth-dialog-titlebar">
                        <span class="auth-title-text">ACCOUNT // USER PROFILE</span>
                        <button type="button" id="user-modal-close-btn" class="auth-close-x">✖</button>
                    </div>
                    <div class="auth-dialog-body" style="text-align:center;">
                        <p style="font-size:11px; margin-bottom:6px; color:#444;">Signed in as:</p>
                        <p style="font-size:16px; font-weight:bold; margin-bottom:14px;" id="user-modal-name"></p>
                        <div class="auth-actions-row" style="justify-content:center; gap:8px;">
                            <button type="button" id="user-modal-logout-btn" class="auth-btn error">Log Out</button>
                            <button type="button" id="user-modal-cancel-btn" class="auth-btn">Close</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const closeBtn = modal.querySelector('#user-modal-close-btn');
            const cancelBtn = modal.querySelector('#user-modal-cancel-btn');
            const logoutBtn = modal.querySelector('#user-modal-logout-btn');

            const closeModal = () => { modal.style.display = 'none'; };
            closeBtn.onclick = closeModal;
            cancelBtn.onclick = closeModal;

            logoutBtn.onclick = async () => {
                try {
                    const endpoint = this.getAuthApiUrl('logout');
                    await fetch(endpoint, { method: 'POST', credentials: 'include' });
                } catch(e) {}

                window.currentUser = { authenticated: false, username: '?', token: '' };
                if (window.GameState) window.GameState.currentUser = window.currentUser;
                this.username = '?';
                this.isRegistered = false;
                this.updateAuthDisplay();

                if (window.DarkWorldMultiplayer && typeof window.DarkWorldMultiplayer.updateUserIdentity === 'function') {
                    window.DarkWorldMultiplayer.updateUserIdentity(window.currentUser);
                } else if (typeof window.EventBus !== 'undefined') {
                    window.EventBus.emit('auth:logout');
                }

                this.addSystemMessage('Logged out. Now playing as guest (?).');

                closeModal();
            };
        }

        const nameEl = modal.querySelector('#user-modal-name');
        if (nameEl) nameEl.textContent = this.username || 'User';
        modal.style.display = 'flex';
    }

    /**
     * Updates visibility of log in / sign up link for players not logged into an account in the database.
     */
    updateAuthDisplay() {
        if (this.dom.authLink) {
            this.dom.authLink.href = '#';
            this.dom.authLink.style.display = this.isRegistered ? 'none' : 'inline-block';
        }
        if (this.dom.barAuthLink) {
            this.dom.barAuthLink.href = '#';
            this.dom.barAuthLink.style.display = this.isRegistered ? 'none' : 'inline-block';
        }
        if (this.dom.accountBadge) {
            if (this.isRegistered) {
                const displayName = this.hidePlayerName ? '??' : (this.username || 'User');
                this.dom.accountBadge.textContent = displayName;
                this.dom.accountBadge.style.display = 'inline-block';
            } else {
                this.dom.accountBadge.textContent = '?';
                this.dom.accountBadge.style.display = 'inline-block';
            }
        }
        const hudName = document.getElementById('account-hud-name');
        const hudLink = document.getElementById('account-hud-link');
        if (hudName) {
            hudName.textContent = this.isRegistered 
                ? (this.hidePlayerName ? '??' : (this.username || 'User')) 
                : '?';
        }
        if (hudLink) {
            hudLink.href = '#';
            hudLink.style.display = this.isRegistered ? 'none' : 'inline-block';
        }
        this.updateHideNameDisplay();
        this.updateTextMessageToolMeta();
        this.updateCharacterDisplayName();
    }

    updateHideNameDisplay() {
        if (this.dom.accountBadge) {
            if (this.isRegistered) {
                const displayName = this.hidePlayerName ? '??' : (this.username || 'User');
                this.dom.accountBadge.textContent = displayName;
                this.dom.accountBadge.style.display = 'inline-block';
            } else {
                this.dom.accountBadge.textContent = '?';
                this.dom.accountBadge.style.display = 'inline-block';
            }
        }
        if (this.isSubmenuOpen) {
            this.renderTabSubmenu();
        }
        this.updateTextMessageToolMeta();
        this.updateCharacterDisplayName();
    }

    updateTextMessageToolMeta(roomOverride = null) {
        const authorEl = (this.dom && this.dom.textMsgToolAuthor) || document.getElementById('text-msg-tool-author');
        const roomEl = (this.dom && this.dom.textMsgToolRoom) || document.getElementById('text-msg-tool-room');
        const displayName = this.isRegistered
            ? (this.hidePlayerName ? '??' : this.formatUsername(this.username || 'User'))
            : '?';
        const room = roomOverride || (window.GameState && window.GameState.currentRoom) || 'world';
        if (authorEl) authorEl.textContent = displayName;
        if (roomEl) roomEl.textContent = `[${room}]`;
    }

    focusTextMessageTool() {
        const inputEl = (this.dom && this.dom.textMsgToolInput) || document.getElementById('text-msg-tool-input');
        if (inputEl) {
            inputEl.focus();
            const len = inputEl.value ? inputEl.value.length : 0;
            if (typeof inputEl.setSelectionRange === 'function') {
                inputEl.setSelectionRange(len, len);
            }
            setTimeout(() => {
                if (this.isTextMessageToolOpen) {
                    inputEl.focus();
                    if (typeof inputEl.setSelectionRange === 'function') {
                        inputEl.setSelectionRange(len, len);
                    }
                }
            }, 15);
        }
    }

    openTextMessageTool() {
        this.isTextMessageToolOpen = true;
        window.isTextMessageToolOpen = true;
        this._ignoreOpeningKeyRepeat = true;

        this.updateTextMessageToolMeta();
        const box = (this.dom && this.dom.textMsgToolBox) || document.getElementById('text-message-tool-box');
        if (box) {
            box.classList.remove('hidden');
        }
        const inputEl = (this.dom && this.dom.textMsgToolInput) || document.getElementById('text-msg-tool-input');
        this.renderMessageLinesIntoToolElement(inputEl ? inputEl.value : '');
        this.focusTextMessageTool();

        if (window.inputControllerInstance) {
            window.inputControllerInstance.hotbarSupply1Latched = false;
            window.inputControllerInstance.hotbarSupply2Latched = false;
            window.inputControllerInstance.hotbarSupply3Latched = false;
            window.inputControllerInstance.keys['j'] = false;
            window.inputControllerInstance.keys['i'] = false;
            window.inputControllerInstance.keys['l'] = false;
            window.inputControllerInstance.keys['1'] = false;
            window.inputControllerInstance.keys['2'] = false;
            window.inputControllerInstance.keys['3'] = false;
        }

        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
        return true;
    }

    closeTextMessageTool() {
        this.isTextMessageToolOpen = false;
        window.isTextMessageToolOpen = false;
        this._ignoreOpeningKeyRepeat = false;

        const box = (this.dom && this.dom.textMsgToolBox) || document.getElementById('text-message-tool-box');
        if (box) {
            box.classList.add('hidden');
        }
        const inputEl = (this.dom && this.dom.textMsgToolInput) || document.getElementById('text-msg-tool-input');
        if (inputEl) {
            inputEl.blur();
        }
        const canvas = document.getElementById('glCanvas');
        if (canvas) canvas.focus();

        if (window.inputControllerInstance) {
            window.inputControllerInstance.hotbarSupply1Latched = false;
            window.inputControllerInstance.hotbarSupply2Latched = false;
            window.inputControllerInstance.hotbarSupply3Latched = false;
            window.inputControllerInstance.keys['j'] = false;
            window.inputControllerInstance.keys['i'] = false;
            window.inputControllerInstance.keys['l'] = false;
            window.inputControllerInstance.keys['1'] = false;
            window.inputControllerInstance.keys['2'] = false;
            window.inputControllerInstance.keys['3'] = false;
        }

        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
        return false;
    }

    toggleHidePlayerName(forceState = null) {
        if (!this.isRegistered) return false;
        this.hidePlayerName = (forceState !== null) ? forceState : !this.hidePlayerName;
        try {
            localStorage.setItem('dw_hide_player_name', this.hidePlayerName ? 'true' : 'false');
        } catch (e) {}
        this.updateHideNameDisplay();
        this.updateAuthDisplay();
        this.updateCharacterDisplayName();
        if (typeof window.EventBus !== 'undefined') {
            window.EventBus.emit('chat:nameToggled', { hideName: this.hidePlayerName });
            window.EventBus.emit('sfx:play', 'assign');
            window.EventBus.emit('log:entry', { 
                tag: 'PHONE', 
                message: `Chat Name Visibility: ${this.hidePlayerName ? 'HIDDEN (??)' : 'VISIBLE'}.` 
            });
        }
        return this.hidePlayerName;
    }

    getSubmenuItems() {
        const items = [
            { id: 'resume', label: 'RESUME CHAT' },
            { id: 'close', label: 'CLOSE CHAT' },
            { id: 'toggle_notifications', label: 'TOGGLE NOTIFICATIONS' }
        ];
        if (this.isRegistered) {
            items.push({ id: 'toggle_name', label: 'TOGGLE NAME' });
        }
        return items;
    }

    isToggleNameAvailable() {
        return !!this.isRegistered;
    }

    openTabSubmenu() {
        this.isSubmenuOpen = true;
        this.submenuSelectedIndex = 0;
        if (this.dom.input) this.dom.input.blur();
        this.renderTabSubmenu();
        if (this.dom.tabSubmenu) {
            this.dom.tabSubmenu.classList.remove('hidden');
        }
        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
    }

    closeTabSubmenu() {
        this.isSubmenuOpen = false;
        if (this.dom.tabSubmenu) {
            this.dom.tabSubmenu.classList.add('hidden');
        }
    }

    focusChatInput() {
        const inputEl = (this.dom && this.dom.input) || document.getElementById('chat-input');
        if (inputEl) {
            inputEl.focus();
            const len = inputEl.value ? inputEl.value.length : 0;
            if (typeof inputEl.setSelectionRange === 'function') {
                inputEl.setSelectionRange(len, len);
            }
            setTimeout(() => {
                inputEl.focus();
                if (typeof inputEl.setSelectionRange === 'function') {
                    inputEl.setSelectionRange(len, len);
                }
            }, 10);
        }
    }

    toggleTabSubmenu() {
        if (this.isSubmenuOpen) {
            this.closeTabSubmenu();
            this.focusChatInput();
        } else {
            this.openTabSubmenu();
        }
    }

    navigateSubmenu(dir) {
        if (!this.isSubmenuOpen) return;
        const items = this.getSubmenuItems();
        if (items.length <= 1) return;
        this.submenuSelectedIndex = (this.submenuSelectedIndex + dir + items.length) % items.length;
        this.renderTabSubmenu();
        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
    }

    selectSubmenuOption() {
        if (!this.isSubmenuOpen) return;
        const items = this.getSubmenuItems();
        const item = items[this.submenuSelectedIndex] || items[0];
        if (!item) return;
        this.selectSubmenuItem(item.id);
    }

    selectSubmenuItem(actionId) {
        if (actionId === 'resume') {
            this.closeTabSubmenu();
            this.focusChatInput();
            if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
            return true;
        } else if (actionId === 'close') {
            this.closeTabSubmenu();
            this.toggleCellPhone(false);
            if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
            return true;
        } else if (actionId === 'toggle_notifications' || actionId === 'toggle_notifs') {
            this.toggleNotifications();
            this.closeTabSubmenu();
            this.focusChatInput();
            if (typeof window.EventBus !== 'undefined') {
                window.EventBus.emit('sfx:play', 'assign');
                window.EventBus.emit('log:entry', {
                    tag: 'PHONE',
                    message: `Chat Notifications: ${this.notificationsEnabled ? 'ON' : 'OFF'}.`
                });
            }
            return true;
        } else if (actionId === 'toggle_name') {
            if (!this.isRegistered) {
                return false;
            }
            this.toggleHidePlayerName();
            this.closeTabSubmenu();
            this.focusChatInput();
            if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'assign');
            return true;
        }
        return false;
    }

    renderTabSubmenu() {
        if (!this.dom.tabSubmenuList) {
            this.dom.tabSubmenuList = document.getElementById('chat-tab-submenu-list');
        }
        if (!this.dom.tabSubmenuList) return;

        const items = this.getSubmenuItems();
        if (this.submenuSelectedIndex >= items.length) {
            this.submenuSelectedIndex = 0;
        }
        const pf = window.PixelFont;
        let html = '';
        items.forEach((item, idx) => {
            const isSelected = idx === this.submenuSelectedIndex;
            const cursorGlyph = isSelected ? '▶' : ' ';
            const cursorHtml = pf ? pf.render(cursorGlyph) : (isSelected ? '▶' : '&nbsp;');
            const labelHtml = pf ? pf.render(item.label) : item.label;

            // Mouseover has NO effect for selecting options; click triggers selection
            html += `
                <div class="gba-menu-row ${isSelected ? 'selected' : ''}" 
                     data-action="${item.id}" 
                     data-index="${idx}"
                     onclick="window.ChatUI && window.ChatUI.selectSubmenuIndex(${idx})">
                    <span class="gba-cursor">${cursorHtml}</span>
                    <span class="gba-item-label">${labelHtml}</span>
                </div>
            `;
        });
        this.dom.tabSubmenuList.innerHTML = html;
    }

    setSubmenuHoverIndex(idx) {
        // Mouseover has no effect for selecting options within the menu
    }

    selectSubmenuIndex(idx) {
        this.submenuSelectedIndex = idx;
        this.selectSubmenuOption();
    }

    /**
     * Updates and projects the character's display name above the character.
     * When name is toggled off, ?? appears above the character.
     */
    updateCharacterDisplayName() {
        if (!this.characterDisplayNameEl) {
            let parentContainer = document.getElementById('darkworld-nametags-container');
            if (!parentContainer) {
                parentContainer = document.createElement('div');
                parentContainer.id = 'darkworld-nametags-container';
                parentContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 600; overflow: hidden;';
                const screenContainer = document.getElementById('game-screen-container') || document.body;
                screenContainer.appendChild(parentContainer);
            }
            this.characterDisplayNameEl = document.getElementById('character-display-name');
            if (!this.characterDisplayNameEl) {
                this.characterDisplayNameEl = document.createElement('div');
                this.characterDisplayNameEl.id = 'character-display-name';
                this.characterDisplayNameEl.className = 'character-display-name darkworld-nametag';
                parentContainer.appendChild(this.characterDisplayNameEl);
            }
        }

        const gs = window.GameState;
        const isFirstPerson = !!(gs && gs.isFirstPerson);

        // In first-person view, the player's own name should not be shown in the Light World.
        if (isFirstPerson) {
            if (this._lastDisplayNameVisible !== false) {
                this.characterDisplayNameEl.style.display = 'none';
                this._lastDisplayNameVisible = false;
            }
            return;
        }

        const displayName = this.isRegistered 
            ? (this.hidePlayerName ? '??' : this.formatUsername(this.username || 'User'))
            : '?';
        if (this._lastDisplayNameText !== displayName) {
            this.characterDisplayNameEl.textContent = displayName;
            this._lastDisplayNameText = displayName;
        }

        // Position directly above the character in screen space
        if (typeof renderer === 'undefined' || !renderer || !renderer.canvas) return;
        if (!gs || !gs.characterEntity) {
            if (this._lastDisplayNameVisible !== false) {
                this.characterDisplayNameEl.style.display = 'none';
                this._lastDisplayNameVisible = false;
            }
            return;
        }

        const aspect = renderer.canvas.width / renderer.canvas.height;
        const charPos = gs.characterEntity.position;
        const screen = this.worldToScreen(charPos[0], charPos[1], charPos[2], aspect, 'LIGHT', gs);
        if (screen) {
            const sx = Math.round(screen.x);
            const sy = Math.round(screen.y - 24);
            if (this._lastDisplayNameVisible !== true) {
                this.characterDisplayNameEl.style.display = 'block';
                this._lastDisplayNameVisible = true;
            }
            if (this._lastDisplayNameX !== sx || this._lastDisplayNameY !== sy) {
                this.characterDisplayNameEl.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
                this._lastDisplayNameX = sx;
                this._lastDisplayNameY = sy;
            }
        } else if (this._lastDisplayNameVisible !== false) {
            this.characterDisplayNameEl.style.display = 'none';
            this._lastDisplayNameVisible = false;
        }
    }

    toggleCellPhone(forceState = null) {
        this.isPhoneOpen = (forceState !== null) ? forceState : !this.isPhoneOpen;
        window.isCellPhoneOpen = this.isPhoneOpen;

        const dm = (typeof window !== 'undefined' && window.debugMenu) ? window.debugMenu : (typeof debugMenu !== 'undefined' ? debugMenu : null);
        if (this.isPhoneOpen) {
            this.closeTabSubmenu();
            if (dm) {
                dm.openCellPhoneMenu();
            } else {
                const overlay = document.getElementById('cell-phone-menu-overlay') || this.dom.container;
                if (overlay) overlay.classList.remove('hidden');
            }
            setTimeout(() => {
                if (this.dom.input) this.dom.input.focus();
            }, 40);
            if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
        } else {
            this.closeTabSubmenu();
            if (dm) {
                dm.closeCellPhoneMenu();
            } else {
                const overlay = document.getElementById('cell-phone-menu-overlay') || this.dom.container;
                if (overlay) overlay.classList.add('hidden');
            }
            if (this.dom.input) this.dom.input.blur();
            const canvas = document.getElementById('glCanvas');
            if (canvas) canvas.focus();
            if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
        }

        if (window.inputControllerInstance) {
            window.inputControllerInstance.hotbarSupply1Latched = false;
            window.inputControllerInstance.hotbarSupply2Latched = false;
            window.inputControllerInstance.hotbarSupply3Latched = false;
            window.inputControllerInstance.keys['j'] = false;
            window.inputControllerInstance.keys['i'] = false;
            window.inputControllerInstance.keys['l'] = false;
            window.inputControllerInstance.keys['1'] = false;
            window.inputControllerInstance.keys['2'] = false;
            window.inputControllerInstance.keys['3'] = false;
        }

        return this.isPhoneOpen;
    }

    toggleNotifications(forceState = null) {
        this.notificationsEnabled = (forceState !== null) ? !!forceState : !this.notificationsEnabled;
        try {
            localStorage.setItem('dw_chat_notifications', this.notificationsEnabled ? 'true' : 'false');
        } catch (e) {}
        this.updateNotifButtonDisplay();
        this.updateRoomNotificationVisibility();
        if (typeof window.EventBus !== 'undefined') window.EventBus.emit('sfx:play', 'nav');
        return this.notificationsEnabled;
    }

    updateNotifButtonDisplay() {
        if (this.dom.phoneNotifBtn) {
            this.dom.phoneNotifBtn.textContent = this.notificationsEnabled ? '🔔 NOTIFS: ON' : '🔕 NOTIFS: OFF';
            this.dom.phoneNotifBtn.classList.toggle('off', !this.notificationsEnabled);
        }
    }

    updateRoomNotificationVisibility() {
        const toast = document.getElementById('room-chat-notification');
        if (!toast) return;
        if (this.lastChatMessage) {
            const authorEl = document.getElementById('notif-toast-author');
            const msgEl = document.getElementById('notif-toast-msg');
            const roomEl = document.getElementById('notif-toast-room');
            if (authorEl) authorEl.textContent = this.formatUsername(this.lastChatMessage.author || '?');
            if (msgEl) this.renderMessageLinesIntoElement(msgEl, this.lastChatMessage.message || '');
            if (roomEl) roomEl.textContent = `[${this.lastChatMessage.room || 'world'}]`;
        }
        if (this.notificationsEnabled) {
            toast.classList.remove('hidden');
        } else {
            toast.classList.add('hidden');
        }
    }

    showRoomNotification(author, message, room = 'world') {
        const cleanAuthor = this.formatUsername(author || '?');
        const cleanMsg = String(message || '').slice(0, this.maxMessageLength);
        this.saveLastChatMessage(cleanAuthor, cleanMsg, room || 'world');
        const toast = document.getElementById('room-chat-notification');
        if (!toast) return;
        const authorEl = document.getElementById('notif-toast-author');
        const msgEl = document.getElementById('notif-toast-msg');
        const roomEl = document.getElementById('notif-toast-room');
        if (authorEl) authorEl.textContent = cleanAuthor;
        if (msgEl) this.renderMessageLinesIntoElement(msgEl, cleanMsg);
        if (roomEl) roomEl.textContent = `[${room || 'world'}]`;

        if (this.notificationsEnabled) {
            toast.classList.remove('hidden');
        } else {
            toast.classList.add('hidden');
        }
    }

    hideRoomNotification() {
        const toast = document.getElementById('room-chat-notification');
        if (toast) toast.classList.add('hidden');
        if (this.notifTimer) {
            clearTimeout(this.notifTimer);
            this.notifTimer = null;
        }
    }

    /**
     * Ticker running every 100ms to monitor window expiration and live countdowns.
     */
    startTicker() {
        setInterval(() => {
            const now = Date.now();
            let changed = false;

            // 1 Minute Reset: After one minute from the time of the first message when it said 0, it is set to 0.
            if (this.firstMinuteTime !== null) {
                if (now - this.firstMinuteTime >= 60000) {
                    this.minuteCount = 0;
                    this.firstMinuteTime = null;
                    changed = true;
                }
            }

            // 1 Hour Reset: Resets one hour after the first chat message when it said 0/45.
            if (this.firstHourTime !== null) {
                if (now - this.firstHourTime >= 3600000) {
                    this.hourCount = 0;
                    this.firstHourTime = null;
                    changed = true;
                }
            }

            if (changed) {
                this.saveLimits();
            }

            this.updateDisplay();
        }, 100);
    }

    /**
     * Updates all rate counter DOM elements and button states.
     */
    updateDisplay() {
        const minText = `${this.minuteCount}/${this.minuteLimit}m`;
        const hourText = `${this.hourCount}/${this.hourLimit}h`;

        if (this.dom.counterMin) this.dom.counterMin.textContent = minText;
        if (this.dom.counterHour) this.dom.counterHour.textContent = hourText;
        if (this.dom.barMin) this.dom.barMin.textContent = minText;
        if (this.dom.barHour) this.dom.barHour.textContent = hourText;

        const isMinBlocked = this.minuteCount >= this.minuteLimit;
        const isHourBlocked = this.hourCount >= this.hourLimit;
        const isBlocked = isMinBlocked || isHourBlocked;

        const now = Date.now();
        let cooldownMsg = '';

        if (isHourBlocked && this.firstHourTime) {
            const msLeft = Math.max(0, 3600000 - (now - this.firstHourTime));
            const mins = Math.floor(msLeft / 60000);
            const secs = Math.floor((msLeft % 60000) / 1000);
            cooldownMsg = `Hourly limit reached. Resets in ${mins}m ${secs}s`;
        } else if (isMinBlocked && this.firstMinuteTime) {
            const msLeft = Math.max(0, 60000 - (now - this.firstMinuteTime));
            const secs = Math.ceil(msLeft / 1000);
            cooldownMsg = `Minute limit reached. Resets in ${secs}s`;
        }

        if (this.dom.cooldownTimer) {
            this.dom.cooldownTimer.textContent = cooldownMsg;
            if (isBlocked) {
                this.dom.cooldownTimer.classList.add('visible');
            } else {
                this.dom.cooldownTimer.classList.remove('visible');
            }
        }

        // Highlight badges if near or at limit
        if (this.dom.counterMin) {
            this.dom.counterMin.classList.toggle('limit-reached', isMinBlocked);
        }
        if (this.dom.counterHour) {
            this.dom.counterHour.classList.toggle('limit-reached', isHourBlocked);
        }
        if (this.dom.barMin) {
            this.dom.barMin.classList.toggle('limit-reached', isMinBlocked);
        }
        if (this.dom.barHour) {
            this.dom.barHour.classList.toggle('limit-reached', isHourBlocked);
        }

        if (this.dom.sendBtn) {
            this.dom.sendBtn.disabled = isBlocked;
        }

        if (this.dom.input) {
            if (isBlocked) {
                this.dom.input.setAttribute('title', cooldownMsg);
            } else {
                this.dom.input.removeAttribute('title');
            }
        }
    }

    /**
     * Submits local player's chat message if within rate limits.
     */
    submitMessage(sourceInput = null) {
        const targetInput = sourceInput || this.dom.input;
        if (!targetInput) return;
        const message = targetInput.value.trim().slice(0, this.maxMessageLength);
        if (!message) return;

        const now = Date.now();

        // 1. Evaluate Minute Rate Limit:
        // If 1 minute has elapsed from first message, reset before evaluating
        if (this.firstMinuteTime !== null && (now - this.firstMinuteTime >= 60000)) {
            this.minuteCount = 0;
            this.firstMinuteTime = null;
        }

        // 2. Evaluate Hourly Rate Limit:
        // If 1 hour has elapsed from first message, reset before evaluating
        if (this.firstHourTime !== null && (now - this.firstHourTime >= 3600000)) {
            this.hourCount = 0;
            this.firstHourTime = null;
        }

        // Check if blocked by minute limit (3/3)
        if (this.minuteCount >= this.minuteLimit) {
            const msLeft = Math.max(0, 60000 - (now - this.firstMinuteTime));
            this.addSystemMessage(`Rate limit: Maximum 3 chats per minute. Please wait ${Math.ceil(msLeft / 1000)}s.`);
            this.updateDisplay();
            return;
        }

        // Check if blocked by hourly limit (15/15)
        if (this.hourCount >= this.hourLimit) {
            const msLeft = Math.max(0, 3600000 - (now - this.firstHourTime));
            const mins = Math.ceil(msLeft / 60000);
            this.addSystemMessage(`Hourly rate limit: Maximum 15 chats per hour. Resets in ${mins}m.`);
            this.updateDisplay();
            return;
        }

        // Record start time on first message when minute count was 0
        if (this.minuteCount === 0) {
            this.firstMinuteTime = now;
        }
        // Increment minute counter (e.g. 0 -> 1/3)
        this.minuteCount++;

        // Record start time on first message when hourly count was 0
        if (this.hourCount === 0) {
            this.firstHourTime = now;
        }
        // Increment hourly counter (e.g. 0 -> 1/15)
        this.hourCount++;

        this.saveLimits();
        this.updateDisplay();

        const localAuthor = this.isRegistered ? (this.hidePlayerName ? '??' : this.formatUsername(this.username || 'User')) : '?';
        const localRoom = (window.GameState && window.GameState.currentRoom) || 'world';
        this.showRoomNotification(localAuthor, message, localRoom);

        // Dispatch via DarkWorldMultiplayer WebSocket client
        if (window.DarkWorldMultiplayer && typeof window.DarkWorldMultiplayer.sendChatMessage === 'function') {
            const result = window.DarkWorldMultiplayer.sendChatMessage(message, {
                hideName: this.isRegistered && this.hidePlayerName
            });
            if (!result || !result.success) {
                this.addSystemMessage(`Notice: ${result ? result.error : 'Connection error'}. Connecting...`);
                // Attempt to reconnect if disconnected
                if (!window.DarkWorldMultiplayer.isConnected) {
                    window.DarkWorldMultiplayer.connect();
                }
            }
        } else {
            this.addSystemMessage('Multiplayer client not ready.');
        }

        // Clear input field and retain focus
        targetInput.value = '';
        if (targetInput === this.dom.textMsgToolInput) {
            this.renderMessageLinesIntoToolElement('');
        }
        targetInput.focus();
    }

    /**
     * Handles incoming broadcast message from room.
     */
    handleIncomingChat(data) {
        if (!data || !data.message) return;

        const currentUsername = (window.currentUser && window.currentUser.username) || '';
        const isSelf = (data.username === currentUsername) || 
                       (this.hidePlayerName && data.username === '??') || 
                       (!this.isRegistered && data.username === '?') ||
                       (window.DarkWorldMultiplayer && data.id === window.DarkWorldMultiplayer.myPlayerId);

        const row = document.createElement('div');
        row.className = `chat-msg-row ${isSelf ? 'chat-msg-self' : 'chat-msg-peer'}`;

        const timeStr = this.formatTimestamp(data.timestamp || Date.now());
        const userStr = this.formatUsername(data.username || (this.isRegistered ? (this.hidePlayerName ? '??' : this.username) : '?'));
        const roomStr = data.room || 'world';
        const splitMsg = this.formatMessageLines(data.message);

        row.innerHTML = `
            <span class="chat-msg-time">${timeStr}</span>
            <span class="chat-msg-room">[${this.escapeHtml(roomStr)}]</span>
            <span class="chat-msg-author">${this.escapeHtml(userStr)}:</span>
            <span class="chat-msg-body">${this.escapeHtml(splitMsg.formatted)}</span>
        `;

        if (this.dom.messagesLog) {
            this.dom.messagesLog.appendChild(row);
            this.scrollToBottom();
        }

        // Play subtle notification audio
        if (typeof window.EventBus !== 'undefined' && !isSelf) {
            window.EventBus.emit('sfx:play', 'assign');
        }

        // Always update the persistent bottom chat notification with the latest text message
        this.showRoomNotification(userStr, data.message, roomStr);

        // Duplicate notifications removed: Only the new-chat styled room toast notification is shown.
    }

    /**
     * Handles server acknowledgment to synchronize authoritative rate counters.
     */
    handleChatAck(data) {
        if (!data) return;
        if (data.minuteCount !== undefined) this.minuteCount = data.minuteCount;
        if (data.firstMinuteTime !== undefined) this.firstMinuteTime = data.firstMinuteTime;
        if (data.hourCount !== undefined) this.hourCount = data.hourCount;
        if (data.firstHourTime !== undefined) this.firstHourTime = data.firstHourTime;

        this.saveLimits();
        this.updateDisplay();
    }

    /**
     * Handles server rate limit violation error packets.
     */
    handleChatError(data) {
        if (!data) return;
        if (data.minuteCount !== undefined) this.minuteCount = data.minuteCount;
        if (data.firstMinuteTime !== undefined) this.firstMinuteTime = data.firstMinuteTime;
        if (data.hourCount !== undefined) this.hourCount = data.hourCount;
        if (data.firstHourTime !== undefined) this.firstHourTime = data.firstHourTime;

        this.saveLimits();
        this.updateDisplay();

        this.addSystemMessage(data.message || 'Chat rate limit reached.');
    }

    addSystemMessage(text) {
        if (!this.dom.messagesLog) return;
        const row = document.createElement('div');
        row.className = 'chat-system-message';
        row.innerHTML = `
            <span class="chat-sys-tag">NOTICE</span>
            <span>${this.escapeHtml(text)}</span>
        `;
        this.dom.messagesLog.appendChild(row);
        this.scrollToBottom();
    }

    addMessage(msg) {
        if (!msg) return;
        if (typeof msg === 'string') {
            this.addSystemMessage(msg);
        } else if (msg.isSystem || msg.author === 'PHONE' || msg.author === 'SYSTEM') {
            this.addSystemMessage(msg.text || msg.message || '');
        } else {
            this.handleIncomingChat({
                username: msg.author || msg.username || 'User',
                message: msg.text || msg.message || '',
                room: msg.room || 'world',
                timestamp: msg.timestamp || Date.now()
            });
        }
    }

    scrollToBottom() {
        if (!this.dom.messagesLog) return;
        requestAnimationFrame(() => {
            this.dom.messagesLog.scrollTop = this.dom.messagesLog.scrollHeight;
        });
    }

    formatTimestamp(ts) {
        const d = new Date(ts);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    }

    escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Displays a temporary overhead speech bubble above the player's character.
     */
    spawnSpeechBubble(senderId, username, text, isSelf) {
        let parentContainer = document.getElementById('darkworld-nametags-container');
        if (!parentContainer) {
            parentContainer = document.createElement('div');
            parentContainer.id = 'darkworld-nametags-container';
            parentContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 600; overflow: hidden;';
            document.body.appendChild(parentContainer);
        }

        const bubble = document.createElement('div');
        bubble.className = `chat-speech-bubble ${isSelf ? 'bubble-self' : 'bubble-peer'}`;
        bubble.innerHTML = `
            <div class="bubble-header">${this.escapeHtml(username)}</div>
            <div class="bubble-text">${this.escapeHtml(text)}</div>
        `;

        parentContainer.appendChild(bubble);

        const bubbleData = {
            el: bubble,
            senderId: senderId,
            isSelf: isSelf,
            spawnTime: Date.now()
        };

        if (isSelf) {
            if (this.localSpeechBubble && this.localSpeechBubble.el && this.localSpeechBubble.el.parentNode) {
                this.localSpeechBubble.el.parentNode.removeChild(this.localSpeechBubble.el);
            }
            this.localSpeechBubble = bubbleData;
        }

        // Animate out and remove after 4.5 seconds
        setTimeout(() => {
            bubble.classList.add('fading');
            setTimeout(() => {
                if (bubble.parentNode) {
                    bubble.parentNode.removeChild(bubble);
                }
                if (this.localSpeechBubble === bubbleData) {
                    this.localSpeechBubble = null;
                }
            }, 400);
        }, 4200);

        this.updateSpeechBubblePositions();
    }

    /**
     * Projects speech bubbles to match WebGL camera screen positions.
     */
    updateSpeechBubblePositions() {
        if (!this.localSpeechBubble || !this.localSpeechBubble.el) return;
        if (typeof renderer === 'undefined' || !renderer || !renderer.canvas) return;
        const gs = window.GameState;
        if (!gs || !gs.characterEntity) return;

        const aspect = renderer.canvas.width / renderer.canvas.height;
        const charPos = gs.characterEntity.position;
        const screen = this.worldToScreen(charPos[0], charPos[1], charPos[2], aspect, 'LIGHT', gs);
        if (screen) {
            this.localSpeechBubble.el.style.transform = `translate(${Math.round(screen.x)}px, ${Math.round(screen.y - 48)}px) translate(-50%, -100%)`;
            this.localSpeechBubble.el.style.display = 'block';
        }
    }

    worldToScreen(x, y, z, aspect, activeDim, gs) {
        // Light World 3D room perspective projection
        const wy = (y !== undefined && y !== null ? Number(y) : 0) + 1.8;
        if (typeof window.project3DWorldToScreen === 'function') {
            const screen = window.project3DWorldToScreen(x, wy, z);
            if (screen) return screen;
        }
        if (window.DarkWorldMultiplayer && typeof window.DarkWorldMultiplayer.project3DWorldToScreen === 'function') {
            const screen = window.DarkWorldMultiplayer.project3DWorldToScreen(x, wy, z);
            if (screen) return screen;
        }
        // Fallback camera approximation if renderer matrices not yet initialized
        const camPos = (gs && gs.cameraTarget) || [0, 0, 0];
        const dx = x - camPos[0];
        const dz = z - camPos[2];
        const normX = dx / (15.0 * aspect);
        const normY = dz / 15.0;
        return {
            x: (normX + 0.5) * renderer.canvas.width,
            y: (normY + 0.5) * renderer.canvas.height
        };
    }

    // Helper query methods for testing and diagnostics
    getMinuteCount() { return this.minuteCount; }
    getHourCount() { return this.hourCount; }
}

// Global Singleton Instance
window.ChatUI = new ChatUIController();

window.toggleCellPhone = function(force) {
    if (window.ChatUI) {
        return window.ChatUI.toggleCellPhone(force);
    }
    return false;
};

window.toggleChatNotifications = function(force) {
    if (window.ChatUI) {
        return window.ChatUI.toggleNotifications(force);
    }
    return false;
};

window.toggleHidePlayerName = function(force) {
    if (window.ChatUI) {
        return window.ChatUI.toggleHidePlayerName(force);
    }
    return false;
};
