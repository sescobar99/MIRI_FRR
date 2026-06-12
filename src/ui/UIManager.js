import GUI from "lil-gui";

export class UIManager {
    constructor(manager) {
        this.params = {
            faceScale: 1.0,
            heightScale: 1.0,
            useBinarySearch: false,
            showErrorHeatmap: false,
            showBoundingWireFrame: true,
            resolution: 2048,
            showOriginalHighPoly: false,
            highPolyX: 0.0,
            highPolyY: 0.0,
            highPolyZ: 0.0,
        };

        this.gui = new GUI();

        const slidersFolder = this.gui.addFolder("Sliders");
        slidersFolder.add(this.params, "faceScale", 0.1, 2.0, 0.01)
            .onChange((val) => manager.updateCubeScale(val));
        slidersFolder.add(this.params, "heightScale", 0, 2, 0.01)
            .onChange((val) => manager.shaderUniforms.uHeightScale.value = val);

        const extensionsFolder = this.gui.addFolder("Extensions");
        extensionsFolder.add(this.params, "useBinarySearch")
            .onChange((val) => manager.shaderUniforms.uUseBinarySearch.value = val);
        extensionsFolder.add(this.params, "showErrorHeatmap")
            .onChange((val) => manager.shaderUniforms.uShowErrorHeatmap.value = val);


        const bakingFolder = this.gui.addFolder("Baking Options");
        bakingFolder.add(this.params, "resolution", [2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1]);
        bakingFolder.add({ trigger: () => manager.handleRebake() }, "trigger").name("Re-bake IBO");


        const highPolyFolder = this.gui.addFolder("High Poly");
        highPolyFolder.add(this.params, "showBoundingWireFrame")
            .onChange((val) => manager.toggleWireframe(val));
        highPolyFolder.add(this.params, "showOriginalHighPoly")
            .onChange((val) => manager.toggleHighPolyVisibility(val));
        highPolyFolder.add(this.params, "highPolyX", -1.0, 1.0, 0.01)
            .name("Position X")
            .onChange((val) => manager.updateHighPolyPosition("x", val));
        highPolyFolder.add(this.params, "highPolyY", -1.0, 1.0, 0.01)
            .name("Position Y")
            .onChange((val) => manager.updateHighPolyPosition("y", val));
        highPolyFolder.add(this.params, "highPolyZ", -1.0, 1.0, 0.01)
            .name("Position Z")
            .onChange((val) => manager.updateHighPolyPosition("z", val));
    }
}