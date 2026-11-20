const VS_SOURCE = `#version 300 es
in vec3 a_position;
in vec3 a_normal;
in vec2 a_texCoord;

uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

out vec3 v_normal;
out vec2 v_texCoord;

void main() {
    v_normal = mat3(u_modelMatrix) * a_normal;
    v_texCoord = a_texCoord;
    gl_Position = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_position, 1.0);
}
`;

const FS_SOURCE = `#version 300 es
precision highp float;

in vec3 v_normal;
in vec2 v_texCoord;

uniform vec3 u_color;
uniform sampler2D u_texture;
uniform bool u_useTexture;
uniform bool u_unlit;

out vec4 fragColor;

void main() {
    vec4 texColor = vec4(1.0);
    if (u_useTexture) {
        texColor = texture(u_texture, v_texCoord);
        if (texColor.a < 0.02) discard;
    }

    if (u_unlit) {
        fragColor = vec4(texColor.rgb * u_color, texColor.a);
    } else {
        vec3 normal = normalize(v_normal);
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.75));
        float diff = max(dot(normal, lightDir), 0.25);
        vec3 finalColor = texColor.rgb * u_color * diff;
        fragColor = vec4(finalColor, texColor.a);
    }
}
`;

const WATER_VS_SOURCE = `#version 300 es
in vec3 a_position;
in vec2 a_texCoord;

uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform vec3 u_waterCenter;
uniform float u_waterElevation;
uniform float u_time;

out vec3 v_worldPos;
out vec2 v_texCoord;
out float v_wave;

void main() {
    // Center water grid around camera X and Z (snapped to avoid jitter)
    vec3 worldPos = vec3(a_position.x + u_waterCenter.x, u_waterElevation, a_position.z + u_waterCenter.z);

    // Multi-octave harmonic wave displacement in world space
    float w1 = sin(worldPos.x * 0.35 + u_time * 2.0 + worldPos.z * 0.25) * 0.045;
    float w2 = cos(worldPos.x * 0.70 - u_time * 1.4 + worldPos.z * 0.50) * 0.030;
    float w3 = sin((worldPos.x - worldPos.z) * 0.15 + u_time * 0.8) * 0.025;
    float totalWave = w1 + w2 + w3;

    worldPos.y += totalWave;
    v_wave = totalWave;
    v_worldPos = worldPos;
    v_texCoord = a_texCoord;

    gl_Position = u_projectionMatrix * u_viewMatrix * vec4(worldPos, 1.0);
}
`;

const WATER_FS_SOURCE = `#version 300 es
precision highp float;

in vec3 v_worldPos;
in vec2 v_texCoord;
in float v_wave;

uniform float u_time;
uniform vec3 u_cameraPosition;

out vec4 fragColor;

void main() {
    // Oceanic palette matching Vid_Ocean_Trench and Vid_Biolume_Cyan
    vec3 deepWater = vec3(0.015, 0.08, 0.18);
    vec3 midWater = vec3(0.02, 0.20, 0.35);
    vec3 crestColor = vec3(0.0, 0.75, 0.85);

    // Dynamic wave ripples
    float ripple1 = sin((v_worldPos.x + v_worldPos.z) * 1.5 + u_time * 2.5);
    float ripple2 = cos((v_worldPos.x * 0.9 - v_worldPos.z * 1.2) + u_time * 1.8);
    float ripple = (ripple1 + ripple2) * 0.5;

    // View direction and Fresnel reflectance
    vec3 viewDir = normalize(u_cameraPosition - v_worldPos);
    vec3 normal = normalize(vec3(ripple1 * 0.06, 1.0, ripple2 * 0.06));
    float ndotv = max(dot(viewDir, normal), 0.0);
    float fresnel = pow(1.0 - ndotv, 3.5);

    // Color gradient based on wave height and crest ripples
    vec3 waterCol = mix(deepWater, midWater, clamp(v_wave * 8.0 + 0.4, 0.0, 1.0));
    waterCol = mix(waterCol, crestColor, max(0.0, ripple * 0.35 + fresnel * 0.45));

    // Specular sun/moon glint
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.75));
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 32.0);
    waterCol += vec3(0.6, 0.9, 1.0) * spec * 0.6;

    // Bioluminescent caustics pattern
    float c1 = sin(v_worldPos.x * 1.8 + u_time * 0.7);
    float c2 = cos(v_worldPos.z * 1.8 - u_time * 0.6);
    float caustic = max(0.0, c1 * c2) * 0.15;
    waterCol += vec3(0.0, 0.18, 0.22) * caustic;

    // Distance horizon fog (fade smoothly into background clearColor 0.08, 0.08, 0.12)
    vec3 fogColor = vec3(0.08, 0.08, 0.12);
    float dist = length(v_worldPos.xz - u_cameraPosition.xz);
    float fog = clamp((dist - 250.0) / 1000.0, 0.0, 1.0);
    waterCol = mix(waterCol, fogColor, fog);

    // Semi-transparency: allows submerged legs and boat hull to be visible
    float alpha = clamp(0.82 + fresnel * 0.15 - fog * 0.1, 0.65, 0.95);

    fragColor = vec4(waterCol, alpha);
}
`;

if (typeof window !== 'undefined') {
    window.VS_SOURCE = VS_SOURCE;
    window.FS_SOURCE = FS_SOURCE;
    window.WATER_VS_SOURCE = WATER_VS_SOURCE;
    window.WATER_FS_SOURCE = WATER_FS_SOURCE;
}

