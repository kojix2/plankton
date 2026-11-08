# This is real Crystal: methods, loops and Math all work.
def petals(count : Int32)
  texture = solid(0, 0, 0)
  count.times do |i|
    texture = texture.add(shape(3, 0.24, 0.008).rotate(i * Math::PI / count))
  end
  texture
end

petals(7)
  .mult(osc(4, 0.04, 1.6))
  .rotate(0.0, 0.08)
  .out
