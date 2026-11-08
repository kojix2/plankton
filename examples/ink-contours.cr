# Posterized, moving topographic contours
levels = param("levels", 6.0, min: 2.0, max: 16.0, step: 1.0)

noise(5, 0.12)
  .posterize(levels, 0.8)
  .color(0.85, 0.96, 1.0)
  .contrast(1.6)
  .out
