"use client"

import { useEffect, useRef } from "react"

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  opacity: number
  color: string
}

const COLORS = [
  "224, 108, 117", // red (#e06c75)
  "91, 141, 239",  // blue
  "86, 182, 194",  // teal
  "198, 120, 221", // purple
  "229, 192, 123", // amber
]

export function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationId: number
    let particles: Particle[] = []
    let mouseX = -1000
    let mouseY = -1000

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.scale(dpr, dpr)
    }

    const createParticles = () => {
      const count = Math.min(Math.floor((window.innerWidth * window.innerHeight) / 12000), 120)
      particles = []
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          radius: Math.random() * 2 + 0.5,
          opacity: Math.random() * 0.5 + 0.1,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
        })
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY
    }

    const handleMouseLeave = () => {
      mouseX = -1000
      mouseY = -1000
    }

    const drawConnection = (p1: Particle, p2: Particle, dist: number, maxDist: number) => {
      const opacity = (1 - dist / maxDist) * 0.15
      ctx.beginPath()
      ctx.strokeStyle = `rgba(${p1.color}, ${opacity})`
      ctx.lineWidth = 0.5
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(p2.x, p2.y)
      ctx.stroke()
    }

    const animate = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      ctx.clearRect(0, 0, w, h)

      const connectionDist = 150

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        // Mouse repulsion
        const dx = p.x - mouseX
        const dy = p.y - mouseY
        const mouseDist = Math.sqrt(dx * dx + dy * dy)
        if (mouseDist < 200) {
          const force = (200 - mouseDist) / 200
          p.vx += (dx / mouseDist) * force * 0.02
          p.vy += (dy / mouseDist) * force * 0.02
        }

        // Velocity damping
        p.vx *= 0.999
        p.vy *= 0.999

        // Update position
        p.x += p.vx
        p.y += p.vy

        // Wrap edges
        if (p.x < -10) p.x = w + 10
        if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10
        if (p.y > h + 10) p.y = -10

        // Draw particle with glow
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${p.color}, ${p.opacity})`
        ctx.fill()

        // Larger glow halo
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${p.color}, ${p.opacity * 0.1})`
        ctx.fill()

        // Draw connections to nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j]
          const ddx = p.x - p2.x
          const ddy = p.y - p2.y
          const dist = Math.sqrt(ddx * ddx + ddy * ddy)
          if (dist < connectionDist) {
            drawConnection(p, p2, dist, connectionDist)
          }
        }

        // Draw connection to mouse
        if (mouseDist < 250) {
          const opacity = (1 - mouseDist / 250) * 0.3
          ctx.beginPath()
          ctx.strokeStyle = `rgba(${p.color}, ${opacity})`
          ctx.lineWidth = 0.8
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(mouseX, mouseY)
          ctx.stroke()
        }
      }

      animationId = requestAnimationFrame(animate)
    }

    resize()
    createParticles()
    animate()

    window.addEventListener("resize", () => {
      resize()
      createParticles()
    })
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseleave", handleMouseLeave)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{ pointerEvents: "none" }}
      aria-hidden="true"
    />
  )
}
