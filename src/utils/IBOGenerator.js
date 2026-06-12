import * as THREE from "three";

import bakeVertexShader from "../shaders/IBO.vert?raw";
import bakeFragmentShader from "../shaders/IBO.frag?raw";

export class IBOGenerator {
    constructor(renderer, resolution = 512) {
        this.renderer = renderer;
        this.resolution = resolution;

        // Create an isolated offscreen scene to avoid rendering background objects
        this.bakeScene = new THREE.Scene();

        // Orthographic Camera configured to look at a 1x1x1 area
        // Left, Right, Top, Bottom bounds set to match base [-0.5, 0.5] geometry bounds
        // Near, Far work as a normalized space [0.0, 1.0] 
        this.orthoCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.0, 1.0);

        this.dataBakeMaterial = new THREE.ShaderMaterial({
            vertexShader: bakeVertexShader,
            fragmentShader: bakeFragmentShader,
            glslVersion: THREE.GLSL3,
            // side: THREE.DoubleSide
        });
    }

    bake(highPolyMesh) {
        // Setup offscreen scene
        const parent = highPolyMesh.parent;
        // Adding to a new scene detaches from parent
        this.bakeScene.add(highPolyMesh);

        // Override momentarily the mesh material for the baking pass
        const originalMaterial = highPolyMesh.material;

        // Set albedo material for baking ibo
        const albedoBakeMaterial = new THREE.MeshBasicMaterial({
            // side: THREE.DoubleSide
        });
        if (originalMaterial.map) albedoBakeMaterial.map = originalMaterial.map;
        if (originalMaterial.color) albedoBakeMaterial.color.copy(originalMaterial.color);

        // Capture all 6 faces of proxy cube
        // Positions are on the surface (centered) of the 1x1x1 cube (dist 0.5), pointing inward
        // [ +X, -X, +Y, -Y, +Z, -Z ]
        const faces = [
            { name: "posX", pos: [+0.5, +0.0, +0.0], up: [0, 1, +0], lookAt: [0, 0, 0] },
            { name: "negX", pos: [-0.5, +0.0, +0.0], up: [0, 1, +0], lookAt: [0, 0, 0] },
            // up -z, otherwise img would be flipped. Top of the texture corresponds to back of the cube
            { name: "posY", pos: [+0.0, +0.5, +0.0], up: [0, 0, -1], lookAt: [0, 0, 0] },
            { name: "negY", pos: [+0.0, -0.5, +0.0], up: [0, 0, +1], lookAt: [0, 0, 0] },
            { name: "posZ", pos: [+0.0, +0.0, +0.5], up: [0, 1, +0], lookAt: [0, 0, 0] },
            { name: "negZ", pos: [+0.0, +0.0, -0.5], up: [0, 1, +0], lookAt: [0, 0, 0] }
        ];

        const bakedMaps = {
            data: {},   // Normals + Depth
            albedo: {}  // Colors
        };

        // Loop through directions and capture the scene matrices
        faces.forEach(face => {
            // https://threejs.org/docs/?q=render#RenderTarget
            // First Render Target. data: Normals + Depth -> configure accordingly (high precision)
            const rtData = new THREE.WebGLRenderTarget(this.resolution, this.resolution, {
                // Do not create fake values
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.RGBAFormat,
                // Support for accurate math later
                type: THREE.FloatType,
                depthBuffer: true
            });

            //  Second Render Target. albedo -> 8-bit color
            const rtAlbedo = new THREE.WebGLRenderTarget(this.resolution, this.resolution, {
                // Blend colors
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType,
                depthBuffer: true
            });

            // Position and orient camera
            this.orthoCamera.position.set(face.pos[0], face.pos[1], face.pos[2]);
            this.orthoCamera.up.set(face.up[0], face.up[1], face.up[2]);
            // All lookAt are 0 anyway
            this.orthoCamera.lookAt(face.lookAt[0], face.lookAt[1], face.lookAt[2]);
            this.orthoCamera.updateProjectionMatrix();

            // Offscreen render pass 1 & 2
            // First pass: data
            highPolyMesh.material = this.dataBakeMaterial;
            this.renderer.setRenderTarget(rtData);
            this.renderer.clear();
            this.renderer.render(this.bakeScene, this.orthoCamera);
            bakedMaps.data[face.name] = rtData.texture;

            // Second pass: albedo
            highPolyMesh.material = albedoBakeMaterial;
            this.renderer.setRenderTarget(rtAlbedo);
            this.renderer.clear();
            this.renderer.render(this.bakeScene, this.orthoCamera);
            bakedMaps.albedo[face.name] = rtAlbedo.texture;
        });

        // Clean up
        this.renderer.setRenderTarget(null);
        highPolyMesh.material = originalMaterial;
        if (parent) {
            parent.add(highPolyMesh);
        }

        console.log("Baking complete! 6 normal+depth maps and 6 albedo maps generated successfully.");
        return bakedMaps;
    }
}