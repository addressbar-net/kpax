<?php
# ==============================================================================
# Cannon Reload Engine (Executed from /addr.bar/addr.bar.2/farmeraga/compiler)
# Compiles 3D models and game assets into farmeraga/cannon/bar.tar
# ==============================================================================

$farmeraga_dir = dirname(__DIR__);
$base_dir = dirname($farmeraga_dir);
$bar_dir = $farmeraga_dir . '/bar';
$cannon_dir = $farmeraga_dir . '/cannon';
$models_dir = $base_dir . '/models';
$compiler_dir = $farmeraga_dir . '/compiler';
$discard_dir = $compiler_dir . '/discard';

# 1. Increment Version
# (pile is the version number.)
$pile_file = $bar_dir . '/pile.txt';
$pile = file_exists($pile_file) ? (int)trim(file_get_contents($pile_file)) : 1;
++$pile;

$output = file_put_contents($pile_file, $pile);
echo "<pre>Incremented version to #{$pile} in {$pile_file}</pre>\n";

$output = file_put_contents($cannon_dir . '/pile.txt', $pile);
echo "<pre>Updated version to #{$pile} in {$cannon_dir}/pile.txt</pre>\n";

# 2. Remove Session File
$output = shell_exec('(mkdir -p /tmp/addr.bar/s)');
$output .= shell_exec("(mv {$bar_dir}/s /tmp/addr.bar/s/s 2>/dev/null || true)");
$output .= shell_exec("(mv {$bar_dir}/system/s /tmp/addr.bar/s/system 2>/dev/null || true)");
$output .= shell_exec("(mv {$bar_dir}/core/s /tmp/addr.bar/s/core 2>/dev/null || true)");
$output .= shell_exec("(mv {$bar_dir}/audio/s /tmp/addr.bar/s/audio 2>/dev/null || true)");
$output .= shell_exec("(mv {$bar_dir}/ui/s /tmp/addr.bar/s/ui 2>/dev/null || true)");
$output .= shell_exec("(mv {$bar_dir}/physics/s /tmp/addr.bar/s/physics 2>/dev/null || true)");
$output .= shell_exec("(mv {$bar_dir}/controls/s /tmp/addr.bar/s/controls 2>/dev/null || true)");
echo "<pre>$output</pre>";

# 3. Copy rooms/ Folder Into bar/
$output = shell_exec("(cp -rv {$models_dir}/rooms {$bar_dir}/)");
echo "<pre>$output</pre>";

# 4. Copy props/ Folder Into bar/
$output = shell_exec("(cp -rv {$models_dir}/props {$bar_dir}/)");
echo "<pre>$output</pre>";

# 5. Copy entities/ Folder Into bar/
$output = shell_exec("(cp -rv {$models_dir}/entities {$bar_dir}/)");
echo "<pre>$output</pre>";

# 6. Compatibility symlinks for tar creation
$output = shell_exec("(cd {$bar_dir} && ln -sf rooms light && ln -sf entities gltf)");
echo "<pre>$output</pre>";

# 7. Delete old bar.tar files in compiler/discard
$output = shell_exec("(mkdir -p {$discard_dir} && rm -rf {$discard_dir}/*)");
echo "<pre>$output</pre>";

# 8. Make Numbered Version (POSIX PAX format supporting unlimited filename lengths)
$tar_file_name = "{$discard_dir}/bar_{$pile}.tar";
$output = shell_exec("(cd {$bar_dir} && tar --format=posix -cf {$tar_file_name} *)");
echo "<pre>$output</pre>";

# 9. Make Latest Version in farmeraga/cannon/bar.tar
$target_tar = $cannon_dir . '/bar.tar';
$output = shell_exec('cp -v ' . escapeshellarg($tar_file_name) . ' ' . escapeshellarg($target_tar));
echo "<pre>$output</pre>";

# 10. Restore Session File
$output = shell_exec("(cp /tmp/addr.bar/s/s {$bar_dir}/s 2>/dev/null || true)");
$output .= shell_exec("(cp /tmp/addr.bar/s/system {$bar_dir}/system/s 2>/dev/null || true)");
$output .= shell_exec("(cp /tmp/addr.bar/s/core {$bar_dir}/core/s 2>/dev/null || true)");
$output .= shell_exec("(cp /tmp/addr.bar/s/audio {$bar_dir}/audio/s 2>/dev/null || true)");
$output .= shell_exec("(cp /tmp/addr.bar/s/ui {$bar_dir}/ui/s 2>/dev/null || true)");
$output .= shell_exec("(cp /tmp/addr.bar/s/physics {$bar_dir}/physics/s 2>/dev/null || true)");
$output .= shell_exec("(cp /tmp/addr.bar/s/controls {$bar_dir}/controls/s 2>/dev/null || true)");
echo "<pre>$output</pre>";

# 11. Delete copied folders and symlinks from bar/
$output = shell_exec("(rm -rf {$bar_dir}/rooms {$bar_dir}/props {$bar_dir}/entities {$bar_dir}/light {$bar_dir}/gltf)");
echo "<pre>$output</pre>";

# 12. Run backup_addr.bar
$ssl_context = stream_context_create([
    'http' => [
        'timeout' => 2
    ],
    'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false
    ]
]);
$backup_result = @file_get_contents('https://localhost/tools/execute_script/?script=backup_addr.bar', false, $ssl_context);
if ($backup_result === false) {
    $output = shell_exec('timeout 10s backup_addr.bar 2>&1 || true');
    echo "<pre>$output</pre>";
} else {
    echo "<pre>backup_addr.bar triggered successfully</pre>";
}
?>