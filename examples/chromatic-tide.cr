# Chromatic tide · change the sliders without recompiling
frequency = param("frequency", 8.0, min: 1.0, max: 40.0, step: 0.1)
folds = param("folds", 5.0, min: 1.0, max: 12.0, step: 1.0)

osc(frequency, 0.045, 1.4)
  .modulate(noise(2.8, 0.12), 0.22)
  .rotate(0.0, 0.04)
  .kaleid(folds)
  .color(0.8, 0.65, 1.3)
  .out
