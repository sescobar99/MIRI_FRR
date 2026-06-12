precision highp float;
in vec3 vLocalPos;
in vec3 vLocalNormal;
out vec4 fragColor;

void main() { 
    // Otho camera Near=0 and Far=1  -> gl_FragCoord.z is already normalized [0,1]
    float depth = gl_FragCoord.z; 

    // Local space normals [-1, 1] -> [0, 1]
    vec3 normal = vLocalNormal * 0.5 + 0.5;

    fragColor = vec4(normal.xyz, depth);
}