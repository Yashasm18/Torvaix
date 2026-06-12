"use client"

import { useEffect, useRef } from "react"

export function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationId: number
    let time = 0

    const resize = () => {
      if (!canvas.parentElement) return
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.parentElement.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx.scale(dpr, dpr)
    }

    const animate = () => {
      time += 0.005
      if (!canvas.parentElement) return
      const w = canvas.parentElement.clientWidth
      const h = canvas.parentElement.clientHeight

      // Clear with dark transparent background for trail effect
      ctx.fillStyle = "rgba(11, 16, 32, 0.2)"
      ctx.fillRect(0, 0, w, h)

      const drawCurve = (
        color: string,
        offsetY: number,
        frequency: number,
        amplitude: number,
        speed: number,
        lineWidth: number
      ) => {
        ctx.beginPath()
        ctx.strokeStyle = color
        ctx.lineWidth = lineWidth
        ctx.lineCap = "round"
        
        for (let x = -100; x <= w + 100; x += 20) {
          const t = time * speed
          const y = offsetY + Math.sin(x * frequency + t) * amplitude + Math.cos(x * frequency * 0.5 - t) * (amplitude * 0.5)
          
          if (x === -100) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.stroke()
      }

      // Draw multiple sweeping glowing lines
      const gradient1 = ctx.createLinearGradient(0, 0, w, 0)
      gradient1.addColorStop(0, "rgba(0, 212, 170, 0)")
      gradient1.addColorStop(0.5, "rgba(0, 212, 170, 0.4)")
      gradient1.addColorStop(1, "rgba(0, 212, 170, 0)")

      const gradient2 = ctx.createLinearGradient(0, 0, w, 0)
      gradient2.addColorStop(0, "rgba(168, 85, 247, 0)")
      gradient2.addColorStop(0.5, "rgba(168, 85, 247, 0.4)")
      gradient2.addColorStop(1, "rgba(168, 85, 247, 0)")

      const gradient3 = ctx.createLinearGradient(0, 0, w, 0)
      gradient3.addColorStop(0, "rgba(59, 130, 246, 0)")
      gradient3.addColorStop(0.5, "rgba(59, 130, 246, 0.3)")
      gradient3.addColorStop(1, "rgba(59, 130, 246, 0)")

      // Glowing blur
      ctx.shadowBlur = 30
      ctx.shadowColor = "rgba(0, 212, 170, 0.5)"
      drawCurve(gradient1, h * 0.4, 0.001, h * 0.2, 1.2, 2)
      
      ctx.shadowBlur = 40
      ctx.shadowColor = "rgba(168, 85, 247, 0.5)"
      drawCurve(gradient2, h * 0.55, 0.0015, h * 0.25, 0.8, 3)

      ctx.shadowBlur = 20
      ctx.shadowColor = "rgba(59, 130, 246, 0.5)"
      drawCurve(gradient3, h * 0.7, 0.0008, h * 0.15, 1.5, 1.5)

      // Reset shadow
      ctx.shadowBlur = 0

      // Draw some floating "data" particles in the background
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)"
      for (let i = 0; i < 50; i++) {
        const px = (Math.sin(i * 13 + time * 0.5) * 0.5 + 0.5) * w
        const py = ((i * 87 + time * 50) % (h + 100)) - 50
        ctx.beginPath()
        ctx.arc(px, py, (i % 3) + 0.5, 0, Math.PI * 2)
        ctx.fill()
      }

      animationId = requestAnimationFrame(animate)
    }

    resize()
    animate()

    window.addEventListener("resize", resize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener("resize", resize)
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
