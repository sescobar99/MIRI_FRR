out vec3 vLocalPos;
out vec3 vLocalNormal;
void main() {
    // Send info to frag
    vLocalPos = position;
    vLocalNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}