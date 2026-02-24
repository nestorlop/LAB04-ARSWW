import { useEffect, useRef, useState } from 'react'
import { createStompClient, subscribeBlueprint } from './lib/stompClient.js'
import { createSocket } from './lib/socketIoClient.js'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001'
const IO_BASE  = import.meta.env.VITE_IO_BASE  ?? 'http://localhost:3001'

export default function App() {
  const [tech, setTech] = useState('socketio')
  const [author, setAuthor] = useState('juan')
  const [name, setName] = useState('')
  const [points, setPoints] = useState([])
  const [blueprints, setBlueprints] = useState([])
  const [totalPoints, setTotalPoints] = useState(0)
  const canvasRef = useRef(null)

  const stompRef = useRef(null)
  const unsubRef = useRef(null)
  const socketRef = useRef(null)

  useEffect(() => {
    if (author) {
      loadBlueprints()
    }
  }, [author])

  useEffect(() => {
    if (author && name) {
      loadBlueprint()
      setupRealtime()
    }
    return () => {
      unsubRef.current?.(); unsubRef.current = null
      stompRef.current?.deactivate?.(); stompRef.current = null
      socketRef.current?.disconnect?.(); socketRef.current = null
    }
  }, [tech, author, name])

  async function loadBlueprints() {
    try {
      const res = await fetch(`${API_BASE}/api/blueprints?author=${author}`)
      const data = await res.json()
      setBlueprints(data)
      const total = data.reduce((sum, bp) => sum + (bp.points?.length || 0), 0)
      setTotalPoints(total)
    } catch (err) {
      console.error('Error loading blueprints:', err)
    }
  }

  async function loadBlueprint() {
    try {
      const res = await fetch(`${API_BASE}/api/blueprints/${author}/${name}`)
      const bp = await res.json()
      setPoints(bp.points || [])
      drawAll({ points: bp.points || [] })
    } catch (err) {
      console.error('Error loading blueprint:', err)
    }
  }

  function drawPoint(point) {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.arc(point.x, point.y, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawAll(bp) {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0,0,600,400)
    ctx.beginPath()
    bp.points.forEach((p,i)=> {
      if (i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y)
    })
    ctx.stroke()
  }

  function setupRealtime() {
    unsubRef.current?.(); unsubRef.current = null
    stompRef.current?.deactivate?.(); stompRef.current = null
    socketRef.current?.disconnect?.(); socketRef.current = null

    if (tech === 'stomp') {
      const client = createStompClient(API_BASE)
      stompRef.current = client
      client.onConnect = () => {
        unsubRef.current = subscribeBlueprint(client, author, name, (upd)=> {
          setPoints(upd.points || [])
          drawAll({ points: upd.points || [] })
        })
      }
      client.activate()
    } else {
      const s = createSocket(IO_BASE)
      socketRef.current = s
      const room = `blueprints.${author}.${name}`
      console.log('Joining room:', room)
      s.emit('join-room', room)
      s.on('blueprint-update', (upd) => {
        console.log('Received update:', upd)
        if (upd.author === author && upd.name === name) {
          setPoints(upd.points || [])
          drawAll({ points: upd.points || [] })
        }
      })
    }
  }

  function onClick(e) {
    if (!name) {
      alert('Por favor ingresa un nombre de plano')
      return
    }
    const rect = e.target.getBoundingClientRect()
    const point = { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) }

    const newPoints = [...points, point]
    setPoints(newPoints)
    drawAll({ points: newPoints })

    if (tech === 'stomp' && stompRef.current?.connected) {
      stompRef.current.publish({ destination: '/app/draw', body: JSON.stringify({ author, name, point }) })
    } else if (tech === 'socketio' && socketRef.current?.connected) {
      const room = `blueprints.${author}.${name}`
      socketRef.current.emit('draw-event', { room, author, name, point })
    }
  }

  async function handleCreate() {
    if (!name) {
      alert('Por favor ingresa un nombre de plano')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/blueprints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, name, points: [] })
      })
      if (res.ok) {
        setPoints([])
        drawAll({ points: [] })
        loadBlueprints()
      } else {
        const err = await res.json()
        alert(err.error || 'Error creating blueprint')
      }
    } catch (err) {
      alert('Error creating blueprint')
    }
  }

  async function handleSave() {
    if (!name) {
      alert('Por favor ingresa un nombre de plano')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/blueprints/${author}/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points })
      })
      if (res.ok) {
        loadBlueprints()
        alert('Plano guardado!')
      }
    } catch (err) {
      alert('Error saving blueprint')
    }
  }

  async function handleDelete() {
    if (!name) {
      alert('Por favor selecciona un plano')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/blueprints/${author}/${name}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setPoints([])
        drawAll({ points: [] })
        setName('')
        loadBlueprints()
      }
    } catch (err) {
      alert('Error deleting blueprint')
    }
  }

  function selectBlueprint(bp) {
    setName(bp.name)
  }

  return (
    <div style={{fontFamily:'Inter, system-ui', padding:16, maxWidth:1000}}>
      <h2>BluePrints RT – Socket.IO vs STOMP</h2>
      
      <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:8}}>
        <label>Tecnología:</label>
        <select value={tech} onChange={e=>setTech(e.target.value)}>
          <option value="socketio">Socket.IO (Node)</option>
          <option value="stomp">STOMP (Spring)</option>
        </select>
        <input value={author} onChange={e=>setAuthor(e.target.value)} placeholder="autor" style={{width:80}}/>
      </div>

      <div style={{display:'flex', gap:16}}>
        <div style={{width:250}}>
          <h3>Planos de {author}</h3>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:14}}>
            <thead>
              <tr style={{background:'#f5f5f5'}}>
                <th style={{padding:8, textAlign:'left'}}>Nombre</th>
                <th style={{padding:8, textAlign:'right'}}>Puntos</th>
              </tr>
            </thead>
            <tbody>
              {blueprints.map((bp, i) => (
                <tr 
                  key={i} 
                  onClick={() => selectBlueprint(bp)}
                  style={{cursor:'pointer', background: bp.name === name ? '#e0e7ff' : 'transparent'}}
                >
                  <td style={{padding:8}}>{bp.name}</td>
                  <td style={{padding:8, textAlign:'right'}}>{bp.points?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{marginTop:8, fontWeight:'bold'}}>Total puntos: {totalPoints}</p>
        </div>

        <div style={{flex:1}}>
          <div style={{display:'flex', gap:8, marginBottom:8}}>
            <input 
              value={name} 
              onChange={e=>setName(e.target.value)} 
              placeholder="Nombre del plano"
              style={{flex:1, padding:8}}
            />
            <button onClick={handleCreate} style={{padding:'8px 16px', background:'#4CAF50', color:'white', border:'none', borderRadius:4, cursor:'pointer'}}>Create</button>
            <button onClick={handleSave} style={{padding:'8px 16px', background:'#2196F3', color:'white', border:'none', borderRadius:4, cursor:'pointer'}}>Save</button>
            <button onClick={handleDelete} style={{padding:'8px 16px', background:'#f44336', color:'white', border:'none', borderRadius:4, cursor:'pointer'}}>Delete</button>
          </div>
          <canvas
            ref={canvasRef}
            width={600}
            height={400}
            style={{border:'1px solid #ddd', borderRadius:12, cursor:'crosshair'}}
            onClick={onClick}
          />
          <p style={{opacity:.7, marginTop:8}}>Tip: abre 2 pestañas y dibuja alternando para ver la colaboración.</p>
        </div>
      </div>
    </div>
  )
}
