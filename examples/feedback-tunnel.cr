# src(o0) samples the PREVIOUS frame; clear buffers to restart
memory = param("memory", 0.94, min: 0.5, max: 0.99, step: 0.01)

src(o0)
  .scale(1.015)
  .rotate(0.012)
  .blend(osc(7, 0.06, 1.8).kaleid(5), 1.0 - memory)
  .saturate(1.01)
  .out(o0)
