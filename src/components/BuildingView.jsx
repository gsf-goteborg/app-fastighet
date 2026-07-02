import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { BUILDING_MODELS, FUNKTION_META, EJ_BOKNINGSBAR, buildingStats } from '../data/byggnad'
import { SCHOOLS } from '../data/schools'
import { RENOV } from '../lib/constants'

/* 3D-byggnadsanalys — rumsnivåmodell av en skolfastighet.
   Modellen är idag en syntetisk exempelmodell (se data/byggnad.js); vyn är
   byggd för att ta emot verkliga uppmätningar (lasermätare → planritning). */

const MODES = [['funktion', 'Funktion'], ['skick', 'Skick'], ['nyttjande', 'Nyttjande']]

function skickColor(s) {
  return s == null ? '#cbd5e1' : RENOV[s][1]
}
function nyttjandeColor(u, funktion) {
  if (EJ_BOKNINGSBAR.has(funktion) || u == null) return '#cbd5e1'
  return u < 0.5 ? '#dc2626' : u < 0.7 ? '#f59e0b' : '#16a34a'
}
function roomColor(r, mode) {
  return mode === 'funktion' ? FUNKTION_META[r.funktion][1]
    : mode === 'skick' ? skickColor(r.skick)
    : nyttjandeColor(r.nyttjande, r.funktion)
}

const LEGEND = {
  funktion: Object.values(FUNKTION_META).map(([label, c]) => [label, c]),
  skick: [5, 4, 3, 2, 1].map((s) => [RENOV[s][0], RENOV[s][1]]).concat([['Ej bedömt', '#cbd5e1']]),
  nyttjande: [
    ['> 70 % av skoldagen', '#16a34a'],
    ['50–70 %', '#f59e0b'],
    ['< 50 % — outnyttjat', '#dc2626'],
    ['Mäts ej (korridor/teknik/WC)', '#cbd5e1'],
  ],
}

export default function BuildingView({ schoolId, setSchoolId }) {
  const mountRef = useRef(null)
  const sceneRef = useRef(null) // { renderer, meshes, planGroups, dispose }
  const [mode, setMode] = useState('skick')
  const [explode, setExplode] = useState(0)
  const [maxPlan, setMaxPlan] = useState(null) // null = alla plan
  const [selected, setSelected] = useState(null) // { rum, husNamn, planNamn }

  const model = BUILDING_MODELS[schoolId]
  const school = SCHOOLS[schoolId]
  const stats = useMemo(() => (model ? buildingStats(model) : null), [model])
  const planCount = useMemo(
    () => (model ? Math.max(...model.hus.map((h) => h.plan.length)) : 0),
    [model],
  )

  // --- bygg scenen (en gång per modell) ------------------------------------
  useEffect(() => {
    if (!model || !mountRef.current) return
    const mount = mountRef.current

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeef2f6)
    scene.fog = new THREE.Fog(0xeef2f6, 260, 480)

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    // ljus
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c4d0, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(90, 130, 60)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const d = 120
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, far: 400 })
    scene.add(sun)

    // mark
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshLambertMaterial({ color: 0xdde5ec }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    const grid = new THREE.GridHelper(600, 60, 0xc3cdd8, 0xd3dce4)
    grid.position.y = 0.02
    scene.add(grid)

    // rum → extruderade volymer, grupperade per (hus, plan)
    const meshes = []
    const planGroups = [] // { group, planIndex, baseY }
    const bounds = new THREE.Box3()
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.35 })

    for (const hus of model.hus) {
      let baseY = 0
      hus.plan.forEach((plan, pi) => {
        const group = new THREE.Group()
        group.position.set(hus.pos[0], baseY + 0.03, hus.pos[1])
        for (const r of plan.rum) {
          const shape = new THREE.Shape(r.poly.map(([x, y]) => new THREE.Vector2(x, -y)))
          const geo = new THREE.ExtrudeGeometry(shape, { depth: plan.hojd - 0.25, bevelEnabled: false })
          geo.rotateX(-Math.PI / 2)
          const mat = new THREE.MeshLambertMaterial({ color: roomColor(r, mode) })
          const mesh = new THREE.Mesh(geo, mat)
          mesh.castShadow = true
          mesh.receiveShadow = true
          mesh.userData = { rum: r, husNamn: hus.namn, planNamn: plan.namn }
          group.add(mesh)
          meshes.push(mesh)
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat)
          mesh.add(edges)
        }
        scene.add(group)
        planGroups.push({ group, planIndex: pi, baseY: baseY + 0.03 })
        bounds.expandByObject(group)
        baseY += plan.hojd
      })
    }

    // kamera mot modellens mitt
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3()).length()
    camera.position.set(center.x + size * 0.7, size * 0.65, center.z + size * 1.0)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(center)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI / 2.05
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.6
    controls.addEventListener('start', () => { controls.autoRotate = false })

    // pekare: hover + klick
    const ray = new THREE.Raycaster()
    const ptr = new THREE.Vector2()
    let hovered = null
    let downAt = null
    const pick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect()
      ptr.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      ray.setFromCamera(ptr, camera)
      const hit = ray.intersectObjects(meshes.filter((m) => m.parent.visible), false)[0]
      return hit ? hit.object : null
    }
    const onMove = (e) => {
      const m = pick(e)
      if (hovered && hovered !== m) hovered.material.emissive.setHex(0)
      hovered = m
      if (m) m.material.emissive.setHex(0x222222)
      renderer.domElement.style.cursor = m ? 'pointer' : 'grab'
    }
    const onDown = (e) => { downAt = [e.clientX, e.clientY] }
    const onUp = (e) => {
      // skilj klick från orbit-drag
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return
      const m = pick(e)
      setSelected(m ? { ...m.userData } : null)
    }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    // storlek + loop
    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)
    let raf
    const loop = () => {
      raf = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    sceneRef.current = { meshes, planGroups }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      controls.dispose()
      meshes.forEach((m) => { m.geometry.dispose(); m.material.dispose() })
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      sceneRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  // --- färgläge + markering --------------------------------------------------
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    for (const m of s.meshes) {
      const isSel = selected && m.userData.rum.id === selected.rum.id && m.userData.husNamn === selected.husNamn
      m.material.color.set(roomColor(m.userData.rum, mode))
      m.material.emissive.setHex(isSel ? 0x1a3a5c : 0)
    }
  }, [mode, selected, model])

  // --- sprängskiss + planfilter ----------------------------------------------
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    for (const pg of s.planGroups) {
      pg.group.position.y = pg.baseY + pg.planIndex * explode * 7
      pg.group.visible = maxPlan == null || pg.planIndex <= maxPlan
    }
  }, [explode, maxPlan, model])

  if (!model) {
    return (
      <div className="bygg-empty">
        <div>
          <h2>Ingen byggnadsmodell för den här skolan ännu</h2>
          <p>Rumsnivåmodeller skapas när lokalerna mäts upp. En syntetisk exempelmodell finns för
            {' '}<button className="reset" onClick={() => setSchoolId(+Object.keys(BUILDING_MODELS)[0])}>
              {SCHOOLS[+Object.keys(BUILDING_MODELS)[0]].namn}
            </button>.</p>
        </div>
      </div>
    )
  }

  const funkYtor = Object.entries(stats.perFunktion).sort((a, b) => b[1] - a[1])

  return (
    <div className="bygg">
      <div className="bygg-canvas" ref={mountRef} />

      {/* Kontroller */}
      <div className="mapctl bygg-ctl">
        <label>Byggnadsanalys</label>
        <select value={schoolId} onChange={(e) => setSchoolId(+e.target.value)}>
          {Object.keys(BUILDING_MODELS).map((id) => (
            <option key={id} value={id}>{SCHOOLS[+id].namn}</option>
          ))}
        </select>
        <div className="bygg-mode seg">
          {MODES.map(([k, label]) => (
            <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{label}</button>
          ))}
        </div>
        <div className="bygg-slider">
          <span>Sprängskiss</span>
          <input type="range" min="0" max="1" step="0.01" value={explode}
            onChange={(e) => setExplode(+e.target.value)} />
        </div>
        {planCount > 1 && (
          <div className="bygg-mode seg">
            <button className={maxPlan == null ? 'on' : ''} onClick={() => setMaxPlan(null)}>Alla plan</button>
            {Array.from({ length: planCount }, (_, i) => (
              <button key={i} className={maxPlan === i ? 'on' : ''} onClick={() => setMaxPlan(i)}>
                t.o.m. {i}
              </button>
            ))}
          </div>
        )}
        <div className="legend">
          {LEGEND[mode].map(([label, c]) => (
            <div className="row" key={label}><span className="dot" style={{ background: c }} />{label}</div>
          ))}
        </div>
        <div className="legend-note">Klicka på ett rum för detaljer. Dra för att rotera, scrolla för att zooma.</div>
      </div>

      {/* Syntetiskt-varning */}
      <div className="bygg-warn">
        <b>Syntetisk exempelmodell</b> — rumsindelning, ytor, skick och nyttjande är påhittade.
        Ersätts av uppmätning (lasermätare) per skolhus; dataformatet är förberett i <code>src/data/byggnad.js</code>.
      </div>

      {/* Rumskort */}
      {selected && (
        <div className="bygg-room">
          <button className="p-close" onClick={() => setSelected(null)}>×</button>
          <div className="bygg-room-head">
            <span className="dot" style={{ background: FUNKTION_META[selected.rum.funktion][1] }} />
            <h3>{selected.rum.namn}</h3>
          </div>
          <div className="bygg-room-sub">{selected.husNamn} · {selected.planNamn}</div>
          <div className="bygg-room-grid">
            <div><span>Funktion</span><b>{FUNKTION_META[selected.rum.funktion][0]}</b></div>
            <div><span>Yta</span><b>{selected.rum.yta} m²</b></div>
            <div><span>Skick</span>
              <b>{selected.rum.skick == null ? 'Ej bedömt'
                : <span className="pill" style={{ background: RENOV[selected.rum.skick][1] }}>{RENOV[selected.rum.skick][0]}</span>}</b>
            </div>
            <div><span>Nyttjande</span>
              <b style={{ color: nyttjandeColor(selected.rum.nyttjande, selected.rum.funktion) }}>
                {EJ_BOKNINGSBAR.has(selected.rum.funktion) || selected.rum.nyttjande == null
                  ? 'Mäts ej' : Math.round(selected.rum.nyttjande * 100) + ' % av skoldagen'}
              </b>
            </div>
          </div>
          <div className="bygg-room-note">syntetiskt — exempelvärden</div>
        </div>
      )}

      {/* Nyckeltal */}
      <div className="bygg-kpis">
        <div className="bygg-kpi">
          <span>Modellerad yta</span>
          <b>{stats.total.toLocaleString('sv')} m²</b>
          <small>register-BTA {school.bta.toLocaleString('sv')} m² <em className="mockflag synth">syntetiskt</em></small>
        </div>
        <div className="bygg-kpi">
          <span>Yta per elev</span>
          <b>{(stats.total / school.elever).toFixed(1)} m²</b>
          <small>{school.elever} elever</small>
        </div>
        <div className="bygg-kpi">
          <span>Undervisningsyta</span>
          <b>{Math.round((stats.undervisning / stats.total) * 100)} %</b>
          <small>{stats.undervisning.toLocaleString('sv')} m² · {stats.klassrum} klassrum</small>
        </div>
        <div className="bygg-kpi">
          <span>Yta i eftersatt/akut skick</span>
          <b style={{ color: stats.eftersatt ? '#dc2626' : '#16a34a' }}>
            {Math.round((stats.eftersatt / stats.total) * 100)} %
          </b>
          <small>{stats.eftersatt.toLocaleString('sv')} m² med skick 4–5</small>
        </div>
        <div className="bygg-kpi">
          <span>Outnyttjat under skoldagen</span>
          <b style={{ color: stats.outnyttjat ? '#dc2626' : '#16a34a' }}>
            {stats.outnyttjat.toLocaleString('sv')} m²
          </b>
          <small>bokningsbara rum &lt; 50 % nyttjande</small>
        </div>
        <div className="bygg-kpi bygg-funk">
          <span>Yta per funktion</span>
          <div className="bygg-funkbar">
            {funkYtor.map(([f, yta]) => (
              <span key={f} title={`${FUNKTION_META[f][0]} · ${yta} m²`}
                style={{ width: (yta / stats.total) * 100 + '%', background: FUNKTION_META[f][1] }} />
            ))}
          </div>
          <small>{funkYtor.slice(0, 3).map(([f, yta]) =>
            `${FUNKTION_META[f][0].split(' ')[0]} ${Math.round((yta / stats.total) * 100)} %`).join(' · ')}</small>
        </div>
      </div>
    </div>
  )
}
