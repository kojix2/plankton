# Hue is a live expression, not a Crystal per-frame callback
voronoi(4.2, 0.3, 0.85)
  .modulate(noise(3.4, 0.15), 0.35)
  .colorama(time * 0.03)
  .rotate(0.0, 0.03)
  .out
