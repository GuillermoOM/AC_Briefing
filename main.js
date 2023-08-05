import * as THREE from "three";

let zoom = 100.0;
const max_zoom = 20;
const cam_start = 500;
const resolution = 514;
const size = 2048;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = cam_start;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

function renderZoom(ev) {
  zoom += ev.deltaY / 50.0;
  if (zoom > 100.0) {
    zoom = 100.0;
  }
  if (zoom < max_zoom) {
    zoom = max_zoom;
  }

  camera.position.z = THREE.MathUtils.mapLinear(zoom, 0, 100, 40, cam_start);
}

window.addEventListener("wheel", renderZoom);

const geometry = new THREE.PlaneGeometry(size, size, resolution, resolution);
const loader = new THREE.TextureLoader();
const heightMap = loader.load("/render.png");
const material = new THREE.ShaderMaterial({
  uniforms: {
    // Feed the heightmap
    bumpTexture: { value: heightMap },
    // Feed the scaling constant for the heightmap
    bumpScale: { value: 50 },
    current_range: THREE.MathUtils.mapLinear(zoom, 0, 100, 0, size/2),
    zoom: 100/zoom,
  },
  vertexShader: `
    uniform sampler2D bumpTexture;
    uniform float bumpScale;
    uniform float zoom;

    varying float vAmount;
    varying vec2 vUV;
    varying vec4 pos;
    
    void main()
    {
        // The "coordinates" in UV mapping representation
        vUV = uv;
    
        // The heightmap data at those coordinates
        vec4 bumpData = texture2D(bumpTexture, uv);
    
        // height map is grayscale, so it doesn't matter if you use r, g, or b.
        vAmount = bumpData.r;
    
        // move the position along the normal
        vec3 newPosition = position + normal * bumpScale * vAmount;
    
        // Compute the position of the vertex using a standard formula

        pos = vec4(newPosition, 1.0);
        gl_PointSize = 1.*zoom;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
    `,
    fragmentShader: `
    uniform float current_range;

    varying vec2 vUV;
    varying float vAmount;
    varying vec4 pos;
    
    void main()
    {
        float test_range = 250.0;

        if ((-current_range < pos.y && pos.y < current_range) && (-current_range < pos.x && pos.x < current_range)){
            gl_FragColor = vec4(vAmount-0.2, vAmount+0.2, vAmount+0.4, 1.0);
        }
        else {
            gl_FragColor = vec4(0,0,0, 1.0);
        }
    }
    `,
  wireframe: false,
});
const mesh = new THREE.Points(geometry, material);
scene.add(mesh);

mesh.lookAt(new THREE.Vector3(0,1,1));

function animate() {
  requestAnimationFrame(animate);
  mesh.material.uniforms.current_range = {
    value: THREE.MathUtils.mapLinear(zoom, 0, 100, 0, size/2),
  };
  mesh.material.uniforms.zoom = {
    value: 100/zoom,
  };
  mesh.rotateOnAxis(new THREE.Vector3(0,0,1), 0.0005)
  renderer.render(scene, camera);
}
animate();
