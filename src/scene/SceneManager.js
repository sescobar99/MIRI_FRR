import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { IBOGenerator } from "../utils/IBOGenerator.js"

import { UIManager } from "../ui/UIManager.js";
import Stats from "stats.js";

// Import shaders as plain/raw text
import vertexShader from "../shaders/shader.vert?raw";
import fragmentShader from "../shaders/shader.frag?raw";

export class SceneManager {
    constructor() {
        this.scene = new THREE.Scene();

        // Camera config
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 50,);
        // this.camera = new THREE.OrthographicCamera(-1,1,1,-1,0,20);

        this.camera.position.set(2, 2, 3); // Set to see the cube
        // this.camera.position.set(0, 0, 4); //Debug
        // this.camera.position.set(2, 2, 3); // Set to see the cube
        // this.camera.position.set(0, 0, 3); // Position for orthographic camera

        // Renderer config
        // WebFLRenderer is needed for materialShaders https://threejs.org/docs/#WebGLRenderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);

        // Add UI
        this.ui = new UIManager(this);
        // Add framerate
        this.stats = new Stats();
        document.body.appendChild(this.stats.dom);

        window.addEventListener("resize", () => this.onResize());

        // Async initialization
        // this.createScene(); // Previous sync init
        this.init();
    }

    async init() {
        await this.loadModel();
        this.createScene();
        this.bakeReliefMaps(this.ui.params.resolution, false);
        // Add high-poly mesh to main scene and sync its starting visibility from UI state
        this.scene.add(this.highPolyMesh);
        this.highPolyMesh.visible = this.ui.params.showOriginalHighPoly;

        this.start();
    }

    createScene() {
        this.shaderUniforms = {
            // Uniforms that map to UI variables
            uHeightScale: { value: this.ui.params.heightScale },
            uUseBinarySearch: { value: this.ui.params.useBinarySearch },
            uShowErrorHeatmap: { value: this.ui.params.showErrorHeatmap },
            // Baked textures as Texture arrays for each of the cube's 6 faces
            // Order: [ +X, -X, +Y, -Y, +Z, -Z ]
            uDataMaps: { value: [null, null, null, null, null, null] },
            uAlbedoMaps: { value: [null, null, null, null, null, null] },
            // These uniforms do not map to UI variables
            // Uniform useful in TNB
            uLocalCameraPos: { value: new THREE.Vector3() },
            // Light
            uAmbientLight: { value: 0.1 },
        };

        // Custom material
        // https://threejs.org/manual/#en/materials
        // https://threejs.org/docs/#ShaderMaterial
        this.reliefMaterial = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: this.shaderUniforms,
            // side: THREE.DoubleSide,
            glslVersion: THREE.GLSL3,
            // wireframe: true
        });

        // The bounding proxy geometry
        this.cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.reliefMaterial);
        // Wired mesh trick
        this.wireFrameMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0xffffff),
            wireframe: true,
            visible: this.ui.params.showBoundingWireFrame,
        })
        this.wireCube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.wireFrameMaterial);

        this.scene.add(this.cube);
        this.scene.add(this.wireCube);
        this.updateCubeScale(this.ui.params.faceScale);

        // Put some light for seeing the original model
        this.scene.add(new THREE.AmbientLight(0xffffff, this.shaderUniforms.uAmbientLight.value));
        this.dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        this.dirLight.target.position.set(0.0, 0.0, 0.0);
        this.scene.add(this.dirLight);
        this.scene.add(this.dirLight.target);

        // Previous model loading scheme 
        // https://www.youtube.com/watch?v=ylyLefnMc1c

    }

    // Loop
    animate() {
        // console.log(this.camera.position)
        requestAnimationFrame(() => this.animate());

        // Camera position in the cube's local coordinate space
        // Unitary cube centered at the origin. More relevant when scaling faces (cube)
        if (this.cube) {
            // Make sure everything is updated
            this.cube.updateMatrixWorld();
            // Get transformation matrix
            const inverseCubeMatrix = this.cube.matrixWorld.clone().invert();
            // Transform from world to cube coordinates
            const localCam = this.camera.position.clone().applyMatrix4(inverseCubeMatrix);
            // Useful/Required information for the shader while doing the relief mapping
            this.shaderUniforms.uLocalCameraPos.value.copy(localCam);
        }

        // Render and update frame stats
        this.renderer.render(this.scene, this.camera);
        this.stats.update();
        // Directional light following the camera to see original model
        this.dirLight.position.copy(this.camera.position);
    }


    async loadModel() {
        const loader = new GLTFLoader();
        return new Promise((resolve, reject) => {
            loader.load(
                // Files in the public directory are served at the root path.
                "./suzanne_base_colored.glb",
                // "./suzanne_base_solid.glb",
                // "./suzanne_ck5_colored.glb",
                // "./suzanne_ck5_solid.glb",
                // "./suzanne_ck7_colored.glb",
                (gltf) => {
                    // console.log("Async load");
                    this.highPolyMesh = gltf.scene.children[0];
                    // console.log(this.highPolyMesh);

                    // Normalize size to fit inside unitary box
                    const box = new THREE.Box3().setFromObject(this.highPolyMesh);
                    const size = new THREE.Vector3();
                    box.getSize(size);
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const scale = 1 / maxDim; // Check if clipping -> make slighit less than 1
                    this.highPolyMesh.scale.setScalar(scale);

                    // console.log(box); // console.log(size); // console.log(gltf); 
                    // // console.log(this.highPolyMesh); // console.log(scale);

                    // Center it at origin
                    box.setFromObject(this.highPolyMesh);
                    const center = new THREE.Vector3();
                    box.getCenter(center);
                    this.highPolyMesh.position.sub(center);
                    resolve();
                },
                undefined,
                (error) => reject(error)
            );
        });
    }

    start() {
        this.animate();
    }


    bakeReliefMaps(resolution = 512, debug = false) {
        // Clean previous textures in case of rebaking them
        if (this.bakedTextures) {
            Object.values(this.bakedTextures.data).forEach(texture => {
                if (texture) texture.dispose();
            });
            Object.values(this.bakedTextures.albedo).forEach(texture => {
                if (texture) texture.dispose();
            });
        }
        const generator = new IBOGenerator(this.renderer, resolution);
        // Always bake with the object centered and visible
        const prevPos = this.highPolyMesh.position.clone();
        this.highPolyMesh.position.set(0.0, 0.0, 0.0);
        const prevV = this.highPolyMesh.visible;
        this.highPolyMesh.visible = true;

        this.bakedTextures = generator.bake(this.highPolyMesh);

        this.highPolyMesh.position.copy(prevPos);
        this.highPolyMesh.visible = prevV;

        // Pass baked textures to shaders uniforms
        // Order: [ +X, -X, +Y, -Y, +Z, -Z ]
        // Normal + Height
        this.shaderUniforms.uDataMaps.value = [
            this.bakedTextures.data.posX,
            this.bakedTextures.data.negX,
            this.bakedTextures.data.posY,
            this.bakedTextures.data.negY,
            this.bakedTextures.data.posZ,
            this.bakedTextures.data.negZ,
        ];
        // Albedo
        this.shaderUniforms.uAlbedoMaps.value = [
            this.bakedTextures.albedo.posX,
            this.bakedTextures.albedo.negX,
            this.bakedTextures.albedo.posY,
            this.bakedTextures.albedo.negY,
            this.bakedTextures.albedo.posZ,
            this.bakedTextures.albedo.negZ,
        ];

        // Useful for debugging if properly baking the textures
        const albedo = false;
        if (debug) this.setupVisualDebug(albedo);

    }

    // ----------------------------------
    // Callback handlers

    updateCubeScale(scaleValue) {
        this.cube.scale.setScalar(scaleValue);
        this.wireCube.scale.setScalar(scaleValue * 1.001); // Lie just on top 
    }
    toggleWireframe(visible) {
        this.wireFrameMaterial.visible = visible;
    }

    toggleHighPolyVisibility(visible) {
        this.highPolyMesh.visible = visible;
    }

    updateHighPolyPosition(axis, value) {
        this.highPolyMesh.position[axis] = value;
    }
    handleRebake() {
        const selectedResolution = this.ui.params.resolution;
        console.log(`Rebaking textures at: ${selectedResolution}px`);
        this.bakeReliefMaps(selectedResolution);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }


    // Sanity check of IBO texture generation
    setupVisualDebug(albedo = false) {
        // BoxGeometry maps materials in the order:
        // [ +X, -X, +Y, -Y, +Z, -Z ]
        if (albedo) {
            this.debugMaterials = [
                new THREE.MeshBasicMaterial({ map: this.bakedTextures.data.posX }),
                new THREE.MeshBasicMaterial({ map: this.bakedTextures.data.negX }),
                new THREE.MeshBasicMaterial({ map: this.bakedTextures.data.posY }),
                new THREE.MeshBasicMaterial({ map: this.bakedTextures.data.negY }),
                new THREE.MeshBasicMaterial({ map: this.bakedTextures.data.posZ }),
                new THREE.MeshBasicMaterial({ map: this.bakedTextures.data.negZ })
            ];
        } else {
            this.debugMaterials = [
                new THREE.MeshBasicMaterial({ map: this.bakedTextures.albedo.posX }),
                new THREE.MeshBasicMaterial({ map: this.bakedTextures.albedo.negX }),
                new THREE.MeshBasicMaterial({ map: this.bakedTextures.albedo.posY }),
                new THREE.MeshBasicMaterial({ map: this.bakedTextures.albedo.negY }),
                new THREE.MeshBasicMaterial({ map: this.bakedTextures.albedo.posZ }),
                new THREE.MeshBasicMaterial({ map: this.bakedTextures.albedo.negZ })
            ];
        }
        this.cube.material = this.debugMaterials;
    }

}