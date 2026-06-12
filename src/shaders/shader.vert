// All of the following things are automatically provided by Three.js under GLSL3 mode
// #version 300 es
// in vec3 position;
// uniform mat4 modelViewMatrix;
// uniform mat4 projectionMatrix;

out vec3 vLocalPos;
out vec3 vLocalNormal;
out vec2 vUv;

void main() {
    // Local position [-0.5, 0.5]
    vLocalPos = position;
    vLocalNormal = normal;
    vUv = uv;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

}