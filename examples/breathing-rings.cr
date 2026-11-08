# Signals support sin, cos, map, clamp and arithmetic
radius = (time * 0.7).sin.map(-1.0, 1.0, 0.16, 0.38)

circle(radius, 0.015)
  .diff(circle(radius * 0.85, 0.015))
  .mult(gradient(0.08))
  .repeat(3, 2)
  .out
