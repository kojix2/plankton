# Four outputs are available. All src reads are one frame delayed.
noise(4, 0.18)
  .color(0.2, 0.8, 1.0)
  .out(o1)

osc(9, 0.08, 1.2)
  .modulate(src(o1), 0.4)
  .kaleid(4)
  .out(o0)

render(o0)
