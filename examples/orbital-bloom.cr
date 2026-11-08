# Transparent polygons, repeated and gently distorted
shape(7, 0.23, 0.015)
  .repeat(4, 3)
  .rotate(0.0, 0.12)
  .color(0.12, 0.9, 0.72)
  .modulate(noise(3, 0.1), 0.18)
  .out
