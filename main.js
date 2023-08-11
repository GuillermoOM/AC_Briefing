import * as THREE from "three";

// Constants
const resolution = 256;
const size = 1024;
const max_zoom = size * 0.15;
const min_zoom = size * 0.65;
const rotation_speed = 0.05;
const lerp_time = 2.0;

// Globals
let camera, map_mesh, line, mission_info;

// Inits
const container = document.getElementById("container");
const reset_view = document.getElementById("reset_view");
const group_box = document.getElementById("groups");
const group_info_box = document.getElementById("group_info");
const renderer = new THREE.WebGLRenderer();
const scene = new THREE.Scene();
const loader = new THREE.TextureLoader();
const camera_clock = new THREE.Clock();
const lerp_clock = new THREE.Clock();
let zoomingIn = false;
let zoomingOut = false;
let screenX = 0.0;
let screenY = 0.0;
let lerp_move_perc = 0.0;
let group_coordinates = [0.0, 0.0, 0.0];
let camera_target = new THREE.Vector3(0.0, 0.0, min_zoom);
let lerp_position = new THREE.Vector3(0.0, 0.0, min_zoom);
let zoom_start_pos = new THREE.Vector3(0.0, 0.0, min_zoom);
let old_orbit_pos = new THREE.Vector2(0.0, 0.0);
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
      highlight_zone: { value: new THREE.Vector2(0.0, 0.0) },
      zone: { value: new THREE.Vector2(0.0, 0.0) },
      current_range: { value: size },
      zoom: { value: min_zoom },
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
  
          gl_PointSize = zoom;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
      }
      `,
    fragmentShader: `
      uniform float current_range;
      uniform bool selection;
      uniform vec2 zone;
      uniform vec2 highlight_zone;
  
      varying vec2 vUV;
      varying float vAmount;
      varying vec4 pos;
      
      void main()
      {
          float length = 100.0;
          float border = 3.0;

          if (selection){
            if ((pos.x > (highlight_zone.x - length - border) && pos.x < (highlight_zone.x + length + border)) && (pos.y > (highlight_zone.y - length - border) && pos.y < (highlight_zone.y + length + border))){
              if ((pos.x > (highlight_zone.x - length + border) && pos.x < (highlight_zone.x + length - border)) && (pos.y > (highlight_zone.y - length + border) && pos.y < (highlight_zone.y + length - border))) {
                gl_FragColor = vec4(vAmount-0.2, vAmount+0.2, vAmount+0.4, 1.0);
              }
              else {
                gl_FragColor = vec4(0.8,0.8,1.0, 1.0);
              }
            }
            else{
              if ((pos.x > (zone.x - current_range) && pos.x < (zone.x + current_range)) && (pos.y > (zone.y - current_range) && pos.y < (zone.y + current_range))) {
                gl_FragColor = vec4(vAmount-0.2, vAmount+0.2, vAmount+0.4, 1.0);
              }
              else {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
              }
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
    group_coordinates = mission_info.groups[event.target.id].coordinates;
    map_mesh.material.uniforms.selection = {
      value: true,
    };
    const obj_coord = new THREE.Vector3(
      group_coordinates[0],
      group_coordinates[1],
      group_coordinates[2]
    );
    map_mesh.material.uniforms.highlight_zone = {
      value: obj_coord,
    };
    const rect = event.target.getBoundingClientRect();
    screenX = rect.right;
    screenY = rect.y + rect.height / 2;
    highlighted = true;
}

function removeHighlight() {
  map_mesh.material.uniforms.selection = {
    value: false,
  };
  highlighted = false;
}

function zoomObjective(event) {
  // get group info
  group_info_box.textContent = '';
  let div_name = document.createElement("div");
  div_name.className = "info_name";
  div_name.textContent = mission_info.groups[event.target.id].name.toUpperCase();
  group_info_box.appendChild(div_name);

  let coord_div = document.createElement("div");
  coord_div.className = "info_item_coords";
  coord_div.innerText = "[ " + mission_info.groups[event.target.id].coordinates + " ]";
  group_info_box.appendChild(coord_div);

  let group_items = mission_info.groups[event.target.id].items
  for (const item in group_items) {
    let div = document.createElement("div");
    div.className = "info_item_name";
    div.innerText = group_items[item].name.toUpperCase();
    group_info_box.appendChild(div);
  }

  // get coords
  group_coordinates = mission_info.groups[event.target.id].coordinates;
  camera_target.x = group_coordinates[0];
  camera_target.y = group_coordinates[1];
  camera_target.z = group_coordinates[2] + max_zoom;
  if (zoomingOut || zoomingIn) {
    Object.assign(zoom_start_pos, ...lerp_position);
    lerp_clock.stop();
  } else {
    Object.assign(zoom_start_pos, ...camera_target);
  }
  map_mesh.material.uniforms.selection = {
    value: false,
  };
  highlighted = false;
  zoomingIn = true;
  lerp_clock.start();
  // group_box.style.visibility = "hidden";
  group_info_box.style.visibility = "visible";
  reset_view.style.visibility = "visible";
}

function resetZoom() {
  camera_target.x = 0.0;
  camera_target.y = 0.0;
  camera_target.z = min_zoom;
  if (zoomingOut || zoomingIn) {
    Object.assign(zoom_start_pos, ...lerp_position);
    lerp_clock.stop();
  } else {
    Object.assign(zoom_start_pos, ...camera_target);
  }
  
  zoomingOut = true;
  lerp_clock.start();
  // group_box.style.visibility = "visible";
  reset_view.style.visibility = "hidden";
  group_info_box.style.visibility = "hidden";
}

// Updates
function update_camera() {
  const time = camera_clock.getElapsedTime();
  const new_orbit_pos = new THREE.Vector2(
    Math.sin(time * rotation_speed),
    Math.cos(time * rotation_speed)
  );
  const angle = old_orbit_pos.angleTo(new_orbit_pos);
  old_orbit_pos = new_orbit_pos;

  if (zoomingIn || zoomingOut) {
    let lerp_elapsed_time = lerp_clock.getElapsedTime();
    if (lerp_elapsed_time < lerp_time) {
      lerp_move_perc = THREE.MathUtils.mapLinear(
        lerp_elapsed_time,
        0,
        lerp_time,
        0.0,
        1.0
      );
      lerp_position = zoom_start_pos.lerp(camera_target, lerp_move_perc);
    } else {
      zoomingIn = false;
      zoomingOut = false;
      lerp_clock.stop();
    }
    map_mesh.material.uniforms.current_range = {
      value: lerp_position.z,
    };
    map_mesh.material.uniforms.zone = {
      value: new THREE.Vector2(lerp_position.x, lerp_position.y),
    };
  }
  else {
    lerp_position = camera_target;
  }
  camera.position.x = new_orbit_pos.x * lerp_position.z + lerp_position.x;
  camera.position.y = new_orbit_pos.y * lerp_position.z + lerp_position.y;
  camera.position.z = lerp_position.z;
  camera.rotateOnWorldAxis(new THREE.Vector3(0.0, 0.0, 1.0), -angle);
}

function update_map() {
  map_mesh.material.uniforms.zoom = {
    value: min_zoom/lerp_position.z,
  };
}

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
  update_map();
  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
