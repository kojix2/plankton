# Cellular color, folded into a glass garden
cells = param("cells", 6.0, min: 2.0, max: 16.0, step: 0.1)

voronoi(cells, 0.22, 0.75)
  .modulate(osc(4.0, 0.05, 0.7), 0.12)
  .kaleid(8)
  .hue(time * 0.025)
  .contrast(1.4)
  .out
