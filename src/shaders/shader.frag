// Already provided by Three.js under GLSL3 mode
// #version 300 es

// Weird settings that apparently webgl needs for the fragment shaders
// Define precision for floats
precision highp float;
precision highp sampler2DArray;

in vec3 vLocalPos;
in vec3 vLocalNormal;
in vec2 vUv;

out vec4 fragColor;

// Uniforms from UIManager
uniform float uHeightScale;
uniform bool uUseBinarySearch;
uniform bool uShowErrorHeatmap;
// Light
uniform float uAmbientLight;
// Calculated on render loop
uniform vec3 uLocalCameraPos;
// Baked textures
uniform sampler2D uDataMaps[6];
uniform sampler2D uAlbedoMaps[6];

// Linear ray marching
// Policarpo 2005 mentioned 32 steps.GPU gems' cone stepping used 15.
#define NUM_LINEAR_STEPS 32.0
// Binary search - 8 as stated by Policarpo 
#define NUM_BINARY_STEPS 8.0

// Helper functions to sample the correct face // Order: [ +X, -X, +Y, -Y, +Z, -Z ]
vec4 sampleData(vec2 uv, int face) {
    if(face == 0)
        return texture(uDataMaps[0], uv);
    if(face == 1)
        return texture(uDataMaps[1], uv);
    if(face == 2)
        return texture(uDataMaps[2], uv);
    if(face == 3)
        return texture(uDataMaps[3], uv);
    if(face == 4)
        return texture(uDataMaps[4], uv);
    return texture(uDataMaps[5], uv);
}
vec4 sampleAlbedo(vec2 uv, int face) {
    if(face == 0)
        return texture(uAlbedoMaps[0], uv);
    if(face == 1)
        return texture(uAlbedoMaps[1], uv);
    if(face == 2)
        return texture(uAlbedoMaps[2], uv);
    if(face == 3)
        return texture(uAlbedoMaps[3], uv);
    if(face == 4)
        return texture(uAlbedoMaps[4], uv);
    return texture(uAlbedoMaps[5], uv);
}

void main() {
    // -------------------------------------
    // 1. Determine face (IBO cube [ +X, -X, +Y, -Y, +Z, -Z ]) and construct TBN frame
    // N is normal pointing inwards the cube (Depth is measured inwards)
    // T goes along the direction the tangen direction (coherent with texturing) 
    // B (perpendicular to both).
    // mat3 column order = TBN // Hardcoded/Indexed as cube is a simple case
    mat3 tangentSpaces[6] = mat3[](
        mat3(vec3(0, 0, -1), vec3(0, 1, 0), vec3(-1, 0, 0)), // 0: +X
        mat3(vec3(0, 0, 1), vec3(0, 1, 0), vec3(1, 0, 0)),  // 1: -X
        mat3(vec3(1, 0, 0), vec3(0, 0, -1), vec3(0, -1, 0)), // 2: +Y
        mat3(vec3(1, 0, 0), vec3(0, 0, 1), vec3(0, 1, 0)),  // 3: -Y
        mat3(vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, -1)), // 4: +Z
        mat3(vec3(-1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1))   // 5: -Z
    );

    // Determine proper TBN. (Normals should be axis aligned for the cube case)
    vec3 absN = abs(vLocalNormal);
    vec3 signN = sign(vLocalNormal); // -1, 0, 1
    // Find dominant axis. X=0, Y=1, Z=2
    int axis = absN.x > absN.y ? (absN.x > absN.z ? 0 : 2) : (absN.y > absN.z ? 1 : 2);
    // Map axis and sign to face index [0 to 5]
    // If sign is positive, add 0. If negative, add 1.
    int faceIndex = (axis * 2) + int(signN[axis] < 0.0);
    // Extract the vectors
    mat3 tbn = tangentSpaces[faceIndex];
    vec3 T = tbn[0];
    vec3 B = tbn[1];
    vec3 N = tbn[2];

    // Having a local coordinate frame -> make operation coherent (all use the same space) -> use it
    // -------------------------------------
    // 2. Setup ray in Tangent Space and prepare ray marching

    // Camera to fragment direction in local frame
    vec3 localViewDir = normalize(vLocalPos - uLocalCameraPos);

    // x <-> T <-> u
    // y <-> B <-> v
    // z <-> N <-> depth
    vec3 rayDirTS;
    rayDirTS.x = dot(localViewDir, T);
    rayDirTS.y = dot(localViewDir, B);
    rayDirTS.z = dot(localViewDir, N);
    //ray in tangent space
    rayDirTS = normalize(rayDirTS);
    // fragColor = vec4(rayDirTS, 1.0);
    // fragColor = vec4(rayDirTS.zzz, 1.0);

    // Discard rays nearly parallel
    if(rayDirTS.z <= 0.001) {
        discard; //Abandon operation of the current fragment
    }

    // Start position in (u, v, depth) space [0.0 to 1.0] (shifted from -0.5, 0.5)
    // Represents where the ray starts its path wrt the face (uv)
    vec2 startUV = vec2(dot(vLocalPos, T), dot(vLocalPos, B)) + 0.5;
    // Current Ray Position
    vec3 crp = vec3(startUV, 0.0);
    // fragColor = vec4(crp, 1.0);
    // green
    // |v   /depth
    // |   /
    // |  /
    // * ______u
    // black   red
    // rgb

    // Relative movement wrt depth. Depth normalization 
    vec3 stepDir = rayDirTS / rayDirTS.z;
    // vec3 stepDir = rayDirTS / max(rayDirTS.z, 0.001);

    // delta is the movement of a single step. Scale using uHeightScale as the max volume depth
    vec3 delta = stepDir * (uHeightScale / NUM_LINEAR_STEPS);

    bool hit = false;
    float sampledDepth = 0.0;
    float stepsTaken = 0.0;

    // -------------------------------------
    // 3. Linear Search
    // Ray marching with fixed number of steps
    for(float i = 0.0; i < NUM_LINEAR_STEPS; i++) {
        crp += delta;
        stepsTaken += 1.0;
        // Stop if the ray escapes the bounding box boundaries
        if(crp.x < 0.0 || crp.x > 1.0 || crp.y < 0.0 || crp.y > 1.0 || crp.z > uHeightScale) {
            break;
        }
        // data has normal +  depth (rgba) (xyz, depth)
        sampledDepth = sampleData(crp.xy, faceIndex).a;
        // Intersection condition: check if ray's depth is already inside fake geometry (scaled 
        // sampled depth). 
        if(crp.z >= (sampledDepth * uHeightScale)) {
            hit = true;
            break;
        }
    }

    // If no intersection found, or background hit (depth ~1.0) -> discard fragment
    if(!hit || sampledDepth >= 0.999) {
        discard;
    }
    // Otherwise, crp represents the first point where the ray is inside (or on top) of the fake geometry

    // -------------------------------------
    // Extensions

    // Binary Search
    if(uUseBinarySearch) {
        // "un-march" to the previous step (before hitting the surface)
        crp -= delta;
        vec3 halfDelta = delta * 0.5;

        // Go back and forth halving delta
        for(float i = 0.0; i < NUM_BINARY_STEPS; i++) {
            crp += halfDelta;
            stepsTaken += 1.0;
            sampledDepth = sampleData(crp.xy, faceIndex).a;
            if(crp.z >= (sampledDepth * uHeightScale)) {
                crp -= halfDelta; // Overstepped, go back
            }
            halfDelta *= 0.5; // Halve
        }
    }

    // Error heatmap
    // How many steps of the possible does the algorithm takes to find 
    if(uShowErrorHeatmap) {
        // Normalize steps taken against maximum possible steps (Linear + Binary if active)
        float binarySteps = uUseBinarySearch ? NUM_BINARY_STEPS : 0.0;
        float maxSteps = NUM_LINEAR_STEPS + binarySteps;
        float error_per = stepsTaken / maxSteps;
        // Go from green to red depending on the value of the error (green few steps)
        fragColor = vec4(mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), error_per), 1.0);
        return;
    }

    // -------------------------------------
    // 4. Shading

    // Get colors and normal corresponding to the ray's uv position
    vec4 sampledAlbedo = sampleAlbedo(crp.xy, faceIndex);
    // Normal: [0, 1] back to [-1, 1]
    vec3 sampledNormal = sampleData(crp.xy, faceIndex).rgb;
    sampledNormal = normalize((2.0 * sampledNormal) - 1.0); //  Convert and Sanity normalization

      // Simple light to visualize the bumps
    float diff = max(dot(sampledNormal, normalize(uLocalCameraPos)), 0.0);
    vec3 diffuse = diff * vec3(0.8); //Almost white light
    // No specular for now
    fragColor = vec4(sampledAlbedo.rgb * (uAmbientLight + diffuse), sampledAlbedo.a);
}
