# Pointer x/y are normalized 0..1; y increases upward
osc(mouse.x * 24.0 + 2.0, 0.04, 1.7)
  .modulate(noise(3, 0.1), mouse.y * 0.6)
  .kaleid(6)
  .color(0.65, 1.0, 1.2)
  .out
