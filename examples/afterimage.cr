# A moving rectangle leaves a fading trail
fresh = rect(0.32, 0.1, 0.015)
  .rotate(time * 0.6)
  .color(0.12, 0.8, 1.0)

src(o0)
  .scale(1.006)
  .brightness(-0.008)
  .layer(fresh)
  .out
