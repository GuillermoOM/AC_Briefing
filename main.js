import * as THREE from "three";
import { MathUtils } from "three";

// Constants
const resolution = 256;
const size = 1024;
const max_zoom = size * 0.15;
const min_zoom = size * 0.65;
const rotation_speed = 0.05;

// Globals
let camera, map_mesh, line, mission_info;

// Inits
const container = document.getElementById("container");
const reset_view = document.getElementById("reset_view");
const group_box = document.getElementById("groups");
const renderer = new THREE.WebGLRenderer();
const scene = new THREE.Scene();
const loader = new THREE.TextureLoader();
const clock = new THREE.Clock();
let screenX = 0.0;
let screenY = 0.0;
let group_coordinates = [0.0, 0.0, 0.0];
let camera_target = new THREE.Vector3(0.0, 0.0, 0.0);
let current_zoom = min_zoom;
let zoomed_in = false;
let highlighted = false;

async function init() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);
  window.addEventListener("resize", onWindowResize);
  reset_view.addEventListener("click", resetZoom);
  setup_camera();
  mission_info = await fetch("/map_info.json")
    .then((response) => response.json())
    .then((json) => {
      return json;
    });
  load_groups();
  load_map(mission_info.map_file);
  create_line();
  animate();
}

function setup_camera() {
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    size * 2
  );
  camera.rotation.z = Math.PI;
  camera.rotation.x = -Math.PI / 4;
  camera.rotateOnWorldAxis(
    new THREE.Vector3(0.0, 0.0, 1.0),
    THREE.MathUtils.degToRad(90)
  );
}

function load_groups() {
  const json_groups = mission_info.groups;
  for (const group in json_groups) {
    let div = document.createElement("div");
    div.id = group;
    div.className = "selection";
    div.innerText = json_groups[group].name.toUpperCase();
    group_box.appendChild(div);
  }
  document.getElementById("groups").childNodes.forEach((element) => {
    element.addEventListener("mouseenter", highlightObjective);
    element.addEventListener("mouseout", removeHighlight);
    element.addEventListener("click", zoomObjective);
  });
}

function load_map(map_file) {
  let map_heightMap = new THREE.Texture();
  map_heightMap = loader.load(map_file);
  const map_geometry = new THREE.PlaneGeometry(
    size,
    size,
    resolution,
    resolution
  );

  const map_material = new THREE.ShaderMaterial({
    uniforms: {
      // Feed the heightmap
      bumpTexture: { value: map_heightMap },
      // Feed the scaling constant for the heightmap
      bumpScale: { value: 50 },
      selection: { value: false },
      zoomed_in: { value: false },
      current_range: { value: size },
      zoom: { value: 1 },
      zone: { value: new THREE.Vector2(0.0, 0.0) },
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
  
          gl_PointSize = 1.0*zoom;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
      }
      `,
    fragmentShader: `
      uniform float current_range;
      uniform bool selection;
      uniform vec2 zone;
      uniform bool zoomed_in;
  
      varying vec2 vUV;
      varying float vAmount;
      varying vec4 pos;
      
      void main()
      {
          float length = 100.0;
          float border = 3.0;

          if (!zoomed_in){
            if (selection){
              if ((pos.x > (zone.x - length - border) && pos.x < (zone.x + length + border)) && (pos.y > (zone.y - length - border) && pos.y < (zone.y + length + border))){
                if ((pos.x > (zone.x - length + border) && pos.x < (zone.x + length - border)) && (pos.y > (zone.y - length + border) && pos.y < (zone.y + length - border))) {
                  gl_FragColor = vec4(vAmount-0.2, vAmount+0.2, vAmount+0.4, 1.0);
                }
                else {
                  gl_FragColor = vec4(0.8,0.8,1.0, 1.0);
                }
              }
              else{
                gl_FragColor = vec4(vAmount-0.2, vAmount+0.2, vAmount+0.4, 1.0);
              }
            }
            else {
              gl_FragColor = vec4(vAmount-0.2, vAmount+0.2, vAmount+0.4, 1.0);
            }
          }
          else {
            if ((pos.x > (zone.x - current_range) && pos.x < (zone.x + current_range)) && (pos.y > (zone.y - current_range) && pos.y < (zone.y + current_range))) {
              gl_FragColor = vec4(vAmount-0.2, vAmount+0.2, vAmount+0.4, 1.0);
            }
            else {
              gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            }
          }
      }
      `,
    wireframe: false,
  });
  map_mesh = new THREE.Points(map_geometry, map_material);
  scene.add(map_mesh);
}

function create_line() {
  // camera coords to world coords
  const points = [];
  points.push(new THREE.Vector3(0.0, 0.0, 0.0));
  points.push(new THREE.Vector3(0.0, 0.0, 0.0));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0xffffff });
  line = new THREE.Line(geometry, material);
  scene.add(line);
}

// Events
function highlightObjective(event) {
  if (!zoomed_in) {
    group_coordinates = mission_info.groups[event.target.id].coordinates;
    map_mesh.material.uniforms.selection = {
      value: true,
    };
    const obj_coord = new THREE.Vector3(
      group_coordinates[0],
      group_coordinates[1],
      group_coordinates[2]
    );
    map_mesh.material.uniforms.zone = {
      value: obj_coord,
    };
    const rect = event.target.getBoundingClientRect();
    screenX = rect.right;
    screenY = rect.y + rect.height / 2;
    highlighted = true;
  }
}

function removeHighlight() {
  map_mesh.material.uniforms.selection = {
    value: false,
  };
  highlighted = false;
}

function zoomObjective(event) {
  group_coordinates = mission_info.groups[event.target.id].coordinates;
  camera_target.x = group_coordinates[0];
  camera_target.y = group_coordinates[1];
  camera_target.z = group_coordinates[2];
  move_camera(
    camera.position.x + camera_target.x,
    camera.position.y + camera_target.y,
    camera.position.z + camera_target.z
  );
  current_zoom = max_zoom;
  const obj_coord = new THREE.Vector2(
    group_coordinates[0],
    group_coordinates[1]
  );
  map_mesh.material.uniforms.zone = {
    value: obj_coord,
  };
  map_mesh.material.uniforms.current_range = {
    value: 100.0,
  };
  map_mesh.material.uniforms.zoomed_in = {
    value: true,
  };
  removeHighlight();
  zoomed_in = true;
  reset_view.style.visibility = "visible";
  group_box.style.visibility = "hidden";
}

function resetZoom() {
  current_zoom = min_zoom;
  camera_target.x = 0.0;
  camera_target.y = 0.0;
  camera_target.z = 0.0;
  move_camera(
    camera.position.x - group_coordinates[0],
    camera.position.y - group_coordinates[1],
    camera.position.z - group_coordinates[2]
  );
  map_mesh.material.uniforms.zone = {
    value: new THREE.Vector2(0.0, 0.0),
  };
  map_mesh.material.uniforms.zoomed_in = {
    value: false,
  };
  zoomed_in = false;
  reset_view.style.visibility = "hidden";
  group_box.style.visibility = "visible";
}

// Updates
function update_objective_line(screenX, screenY, WorldX, WorldY, WorldZ) {
  // Convert screen coordinates to NDC
  if (highlighted) {
    const ndcX = (screenX / window.innerWidth) * 2 - 1;
    const ndcY = -(screenY / window.innerHeight) * 2 + 1;
    const ndcZ = 1.0; // Depth value for the near plane

    // Create a vector representing NDC coordinates
    const ndcVector = new THREE.Vector3(ndcX, ndcY, ndcZ);

    // Use the camera's projection matrix inverse to transform NDC to camera space
    const cameraSpaceVector = ndcVector
      .clone()
      .applyMatrix4(camera.projectionMatrixInverse);

    // Transform the camera space coordinates to world space using the camera's matrixWorld
    const worldSpaceVector = cameraSpaceVector
      .clone()
      .applyMatrix4(camera.matrixWorld);

    const newPositions = new Float32Array([
      worldSpaceVector.x,
      worldSpaceVector.y,
      worldSpaceVector.z, // Vertex 1
      WorldX,
      WorldY,
      WorldZ, // Vertex 2
    ]);

    // Update the position attribute with the new array
    line.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(newPositions, 3)
    );
    // Mark the geometry as needing an update
    line.geometry.attributes.position.needsUpdate = true;
  } else {
    line.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([
          0,
          0,
          0, // Vertex 1
          0,
          0,
          0, // Vertex 2
        ]),
        3
      )
    );
  }
}

function update_camera() {
  const time = clock.getElapsedTime();
  const x_pos =
    camera_target.x + Math.sin(time * rotation_speed) * current_zoom;
  const y_pos =
    camera_target.y + Math.cos(time * rotation_speed) * current_zoom;
  const z_pos = camera_target.z + current_zoom;

  const relative_camera_pos = new THREE.Vector2(
    camera.position.x - camera_target.x,
    camera.position.y - camera_target.y
  );
  const relative_new_pos = new THREE.Vector2(
    x_pos - camera_target.x,
    y_pos - camera_target.y
  );
  const angle = relative_new_pos.angleTo(relative_camera_pos);

  move_camera(x_pos, y_pos, z_pos);
  camera.rotateOnWorldAxis(new THREE.Vector3(0.0, 0.0, 1.0), -angle);
}

function move_camera(targetX, targetY, targetZ) {
  camera.position.x = targetX;
  camera.position.y = targetY;
  camera.position.z = targetZ;
}

function animate() {
  requestAnimationFrame(animate);
  update_camera();
  update_objective_line(
    screenX,
    screenY,
    group_coordinates[0],
    group_coordinates[1],
    group_coordinates[2]
  );
  
  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
