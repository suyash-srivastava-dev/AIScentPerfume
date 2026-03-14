// Wrapped in an async IIFE so it works directly from file:// without a local server
(async function() {
    const THREE = await import('three');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
    const { RoundedBoxGeometry } = await import('three/addons/geometries/RoundedBoxGeometry.js');


// --- Mood Configuration ---
const MOODS = {
    'Fresh Morning': {
        gasColor: '#52c7e8',    // Sky blue — crisp and cool
        accentColor: '#a0e8ff',
        emissiveIntensity: 0.25,
        opacity: 0.70,
        top: ['Bergamot', 'Crisp'],
        heart: ['White Tea', 'Delicate'],
        base: ['Clean Musk', 'Soft']
    },
    'Candlelit Dinner': {
        gasColor: '#e84020',    // Deep crimson-orange — bold and warm
        accentColor: '#ffaa33',
        emissiveIntensity: 0.35,
        opacity: 0.75,
        top: ['Saffron', 'Intense'],
        heart: ['Smoked Oud', 'Warm'],
        base: ['White Amber', 'Deep']
    },
    'Rainy Forest': {
        gasColor: '#20c472',    // Vivid emerald green
        accentColor: '#90efc0',
        emissiveIntensity: 0.2,
        opacity: 0.65,
        top: ['Juniper', 'Cool'],
        heart: ['Wet Earth', 'Damp'],
        base: ['Patchouli', 'Earthy']
    },
    'Luxury Lounge': {
        gasColor: '#8020ff',    // Rich deep violet
        accentColor: '#cc80ff',
        emissiveIntensity: 0.28,
        opacity: 0.70,
        top: ['Cognac', 'Rich'],
        heart: ['Leather', 'Smooth'],
        base: ['Vanilla Bean', 'Sweet']
    }
};

let scene, camera, renderer, controls;
let bottleGroup;
let particles = null;          // THREE.Points
let particleMat = null;
let particlePositions = null;  // Float32Array: base/current positions
let particlePhases = null;     // Float32Array: phase offsets (unused now — kept for API compat)
let particleVelocities = null; // Float32Array: per-particle random velocity
let animationFrameId = null;

// Create a soft circular sprite texture for each particle dot
function makeParticleSprite() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0,   'rgba(255,255,255,1.0)');
    grad.addColorStop(0.35,'rgba(255,255,255,0.7)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}

function init() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    container.innerHTML = '';

    scene = new THREE.Scene();
    scene.background = null;

    camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 2, 8);

    // Renderer setup for high-end glass
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Boost ambient so glass picks up more environment sheen
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 4.5);
    keyLight.position.set(5, 7, 6);
    scene.add(keyLight);
    
    const rimLight = new THREE.DirectionalLight(0xaabbff, 4.0);
    rimLight.position.set(-6, 4, -5);
    scene.add(rimLight);
    
    const frontFill = new THREE.DirectionalLight(0xfff7ec, 2.0);
    frontFill.position.set(0, 2, 8);
    scene.add(frontFill);

    createBottle();

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.target.set(0, 1.0, 0);
    controls.minAzimuthAngle = -Math.PI / 5;
    controls.maxAzimuthAngle = Math.PI / 5;
    controls.minPolarAngle = Math.PI / 3;
    controls.maxPolarAngle = Math.PI / 1.8;

    setupUIEvents();

    const activeOption = document.querySelector('.atm-option.active');
    const initialMood = activeOption?.dataset?.label || 'Fresh Morning';
    setGasStyle(initialMood);
    updateUI(initialMood);

    window.addEventListener('resize', onWindowResize);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animate();
}

function createBottle() {
    bottleGroup = new THREE.Group();
    particles = null;
    particleMat = null;
    particlePositions = null;
    particlePhases = null;

    const initialMood = MOODS['Fresh Morning'];

    // =============================================
    // DUAL-MESH GLASS  (back-face shell + front-face reflective)
    // This is the standard trick for visible glass in Three.js:
    //   Back-face  → creates the tinted edge/silhouette
    //   Front-face → picks up specular highlights & clearcoat
    // =============================================

    // Back-face: slightly larger, dark tinted — gives visible glass edges
    const backGlassMat = new THREE.MeshPhysicalMaterial({
        color: 0x88aacc,       // cool blue-grey tint for glass edges
        metalness: 0.0,
        roughness: 0.1,
        transparent: true,
        opacity: 0.35,
        envMapIntensity: 1.0,
        side: THREE.BackSide,
        depthWrite: false
    });

    // Front-face: white/silver, strong clearcoat for glassy sheen
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.15,
        roughness: 0.03,
        transparent: true,
        opacity: 0.35,
        envMapIntensity: 3.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.01,
        side: THREE.FrontSide,
        depthWrite: false
    });

    // =====================
    //  PARTICLE SYSTEM — Confined to bottle interior
    // =====================
    const COUNT = 1200;
    const W = 0.88, H = 1.45, D = 0.53;  // Bottle interior half-extents

    const positions   = new Float32Array(COUNT * 3);
    const velocities  = new Float32Array(COUNT * 3);
    const phases      = new Float32Array(COUNT);  // kept for compat

    for (let i = 0; i < COUNT; i++) {
        // Random start inside ellipsoid
        let x, y, z;
        do {
            x = (Math.random() - 0.5) * 2 * W;
            y = (Math.random() - 0.5) * 2 * H;
            z = (Math.random() - 0.5) * 2 * D;
        } while ((x/W)**2 + (y/H)**2 + (z/D)**2 > 1);

        positions[i*3]   = x;
        positions[i*3+1] = y;
        positions[i*3+2] = z;

        // Fully independent random velocity for each particle
        const speed = 0.0008 + Math.random() * 0.0014;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        velocities[i*3]   = speed * Math.sin(phi) * Math.cos(theta);
        velocities[i*3+1] = speed * Math.sin(phi) * Math.sin(theta) + 0.0003; // slight upward bias
        velocities[i*3+2] = speed * Math.cos(phi);

        phases[i] = Math.random() * Math.PI * 2;
    }

    particlePositions  = positions;
    particlePhases     = phases;
    particleVelocities = velocities;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));

    const sprite = makeParticleSprite();
    particleMat = new THREE.PointsMaterial({
        map: sprite,
        color: new THREE.Color(initialMood.gasColor),
        size: 0.18,            // Clearly visible dots
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: THREE.NormalBlending,
        alphaTest: 0.05
    });

    particles = new THREE.Points(geo, particleMat);
    bottleGroup.add(particles);

    // --- Outer Glass Body: back-face shell first, then front-face ---
    const bodyGeo = new RoundedBoxGeometry(2.4, 3.6, 1.5, 10, 0.2);
    const backBodyMesh = new THREE.Mesh(bodyGeo, backGlassMat);
    bottleGroup.add(backBodyMesh);
    const bodyMesh = new THREE.Mesh(bodyGeo, glassMat);
    bottleGroup.add(bodyMesh);

    // Glass base — single lightly edged ring, NO solid fill (empty bottle look)
    const baseGeo = new RoundedBoxGeometry(2.3, 0.7, 1.4, 8, 0.14);
    const baseMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0.1, roughness: 0.05,
        transparent: true, opacity: 0.20,   // Very transparent — just shows edge
        envMapIntensity: 3.0, clearcoat: 1.0, clearcoatRoughness: 0.03,
        side: THREE.FrontSide, depthWrite: false
    });
    const backBaseMat2 = new THREE.MeshPhysicalMaterial({
        color: 0x88aacc, metalness: 0.0, roughness: 0.1,
        transparent: true, opacity: 0.18,   // Barely visible edge color
        side: THREE.BackSide, depthWrite: false
    });
    const baseMeshBack = new THREE.Mesh(baseGeo, backBaseMat2);
    baseMeshBack.position.y = -1.45;
    bottleGroup.add(baseMeshBack);
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -1.45;
    bottleGroup.add(baseMesh);

    // Neck — front-face only (back-face neck was visible as trapezoid through body)
    const neckGeo = new THREE.CylinderGeometry(0.55, 0.7, 0.6, 48);
    const neckMesh = new THREE.Mesh(neckGeo, glassMat);
    neckMesh.position.y = 2.1;
    bottleGroup.add(neckMesh);

    // Cap assembly
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.3, roughness: 0.7 });
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, metalness: 0.9, roughness: 0.25, envMapIntensity: 1.5 });

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.2, 48), nozzleMat);
    collar.position.y = 2.5;
    bottleGroup.add(collar);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 32), nozzleMat);
    stem.position.y = 2.85;
    bottleGroup.add(stem);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.7, 32), capMat);
    cap.position.y = 3.45;
    bottleGroup.add(cap);

    const nozzleHole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16),
        new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.4, roughness: 0.6 })
    );
    nozzleHole.rotation.z = Math.PI / 2;
    nozzleHole.position.set(0, 2.72, 0.15);
    bottleGroup.add(nozzleHole);

    // Dip tube removed (was rendering as opaque object inside bottle)

    bottleGroup.position.y = -0.2;
    scene.add(bottleGroup);
}

function setGasStyle(moodName) {
    const mood = MOODS[moodName];
    if (!mood || !particleMat) return;

    const target = new THREE.Color(mood.gasColor);
    gsap.to(particleMat.color, {
        r: target.r,
        g: target.g,
        b: target.b,
        duration: 1.4,
        ease: 'power2.out'
    });
    gsap.to(particleMat, {
        opacity: mood.opacity * 0.85,
        duration: 1.4,
        ease: 'power2.out'
    });
}

function setupUIEvents() {
    const options = document.querySelectorAll('.atm-option');
    if (!options.length) return;

    options.forEach(opt => {
        opt.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');

            const moodName = opt.dataset.label;
            if (!moodName || !MOODS[moodName]) return;

            setGasStyle(moodName);
            updateUI(moodName);
        });
    });
}

function updateUI(moodName) {
    const data = MOODS[moodName];
    if (!data) return;

    const visTitle = document.getElementById('vis-title');
    if (visTitle) visTitle.innerText = moodName;

    const topName = document.getElementById('top-note-name');
    const topTrait = document.getElementById('top-note-trait');
    const heartName = document.getElementById('heart-note-name');
    const heartTrait = document.getElementById('heart-note-trait');
    const baseName = document.getElementById('base-note-name');
    const baseTrait = document.getElementById('base-note-trait');

    if (topName) topName.innerText = data.top[0];
    if (topTrait) topTrait.innerText = data.top[1];
    if (heartName) heartName.innerText = data.heart[0];
    if (heartTrait) heartTrait.innerText = data.heart[1];
    if (baseName) baseName.innerText = data.base[0];
    if (baseTrait) baseTrait.innerText = data.base[1];

    const fill = document.getElementById('synthesis-fill');
    if (fill) {
        fill.style.width = '0%';
        setTimeout(() => { fill.style.width = '100%'; }, 50);
    }

    const stability = document.getElementById('stability-val');
    if (stability) {
        stability.innerText = (0.8 + Math.random() * 0.15).toFixed(3);
    }
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    if (!container || !camera || !renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    animationFrameId = requestAnimationFrame(animate);
    if (controls) controls.update();

    const t = performance.now() * 0.001;

    if (bottleGroup) {
        bottleGroup.position.y = -0.2 + Math.sin(t * 1.15) * 0.04;
        bottleGroup.rotation.y = Math.sin(t * 0.3) * 0.08;
    }

    // Animate particles: every dot has its own random velocity, bounces off bottle walls
    if (particles && particlePositions && particleVelocities) {
        const pos = particles.geometry.attributes.position;
        const COUNT = particlePositions.length / 3;
        const W = 0.88, H = 1.45, D = 0.53;

        for (let i = 0; i < COUNT; i++) {
            let x = particlePositions[i*3];
            let y = particlePositions[i*3+1];
            let z = particlePositions[i*3+2];

            let vx = particleVelocities[i*3];
            let vy = particleVelocities[i*3+1];
            let vz = particleVelocities[i*3+2];

            // Move particle
            x += vx;
            y += vy;
            z += vz;

            // If it wanders outside the ellipsoid, reverse the offending velocity axis
            const inside = (x/W)**2 + (y/H)**2 + (z/D)**2;
            if (inside >= 1.0) {
                // Reflect and nudge back inside
                if (Math.abs(x/W) > Math.abs(y/H) && Math.abs(x/W) > Math.abs(z/D)) {
                    vx = -vx;
                } else if (Math.abs(y/H) > Math.abs(z/D)) {
                    vy = -vy;
                } else {
                    vz = -vz;
                }
                // Step back
                x -= vx * 2;
                y -= vy * 2;
                z -= vz * 2;

                particleVelocities[i*3]   = vx;
                particleVelocities[i*3+1] = vy;
                particleVelocities[i*3+2] = vz;
            }

            particlePositions[i*3]   = x;
            particlePositions[i*3+1] = y;
            particlePositions[i*3+2] = z;

            pos.setXYZ(i, x, y, z);
        }
        pos.needsUpdate = true;
    }

    renderer.render(scene, camera);
}

// Since the IIFE is async, the 'load' event may have already fired while awaiting imports.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init(); // DOM is already ready
}

})(); // End of async IIFE