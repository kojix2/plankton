# A simple geometry chain becomes a colored lattice
shape(4, 0.27, 0.012)
  .repeat(7, 5)
  .rotate(0.785, 0.025)
  .mult(osc(4, 0.08, 1.8).rotate(0.6))
  .out
