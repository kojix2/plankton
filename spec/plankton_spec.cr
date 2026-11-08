require "spec"
require "../src/plankton"

Spec.before_each { Plankton.reset }

describe Plankton do
  it "distinguishes media inputs from output feedback" do
    src(s0).blend(src(s3), 0.5).out
    Plankton.graph.nodes[0].op.should eq("input")
    Plankton.graph.nodes[0].args[0].value.should eq(0.0)
    Plankton.graph.nodes[1].args[0].value.should eq(3.0)
    expect_raises(ArgumentError) { Plankton::Input.new(4) }
    expect_raises(ArgumentError) { Plankton::Input.new(-1) }
  end

  it "encodes audio FFT, volume and tempo expressions" do
    audio.fft(31).to_json.should eq(%({"op":"fft","value":31.0}))
    audio.level.op.should eq("audio_level")
    beat.op.should eq("beat")
    delta.op.should eq("delta")
    expect_raises(ArgumentError) { audio.fft(32) }
    expect_raises(ArgumentError) { audio.fft(-1) }
    src(s2).brightness(audio.level).rotate(beat * 0.1 + delta).out
  end

  it "builds a typed chain and registers its output" do
    texture = osc(12).rotate(0.2).kaleid(6).out
    Plankton.graph.nodes.map(&.op).should eq(["osc", "rotate", "kaleid"])
    Plankton.graph.outputs.should eq([2, nil, nil, nil])
    texture.id.should eq(2)
  end

  it "keeps texture operands in a topologically ordered graph" do
    osc.modulate(noise, 0.2).out
    Plankton.graph.nodes.last.inputs.should eq([0, 1])
  end

  it "allows shared immutable texture values" do
    source = osc
    source.rotate(0.2).out(o0)
    source.kaleid(6).out(o1)
    Plankton.graph.nodes.size.should eq(3)
    Plankton.graph.nodes[1].inputs.should eq([0])
    Plankton.graph.nodes[2].inputs.should eq([0])
  end

  it "encodes feedback as a texture reference, not a graph cycle" do
    src(o0).scale(1.01).blend(osc, 0.1).out
    Plankton.graph.nodes.first.op.should eq("src")
    Plankton.graph.nodes.first.args.first.value.should eq(0.0)
    Plankton.graph.nodes.first.inputs.should be_empty
  end

  it "supports numeric operands on both sides of live signals" do
    (2 * time).op.should eq("mul")
    (1.0 - time).op.should eq("sub")
    (3 + time).op.should eq("add")
    (5.0 / time).op.should eq("div")
    (time * 2).args.last.value.should eq(2.0)
  end

  it "does not change ordinary number arithmetic" do
    (2 + 3).should eq(5)
    (8 / 2).should eq(4.0)
  end

  it "encodes uniforms and nested math" do
    expression = (time * 0.5).sin.map(-1, 1, 0.1, 0.4)
    expression.op.should eq("add")
    mouse.x.op.should eq("mouse_x")
    frame.op.should eq("frame")
  end

  it "deduplicates identical parameter definitions" do
    first = param("speed", 0.2, min: 0, max: 1)
    second = param("speed", 0.2, min: 0, max: 1)
    first.key.should eq(second.key)
    Plankton.graph.params.size.should eq(1)
  end

  it "rejects conflicting parameters and unsafe names" do
    param("speed", 0.2)
    expect_raises(ArgumentError) { param("speed", 0.5) }
    expect_raises(ArgumentError) { param("x);discard;", 0.2) }
    expect_raises(ArgumentError) { param("bad", 0.2, min: 2, max: 1) }
  end

  it "rejects non-finite constants" do
    expect_raises(ArgumentError) { osc(Float64::INFINITY) }
    expect_raises(ArgumentError) { osc(Float64::NAN) }
  end

  it "rejects mixed graphs" do
    first = osc
    Plankton.reset
    expect_raises(ArgumentError) { first.blend(noise) }
  end

  it "bounds graph growth and output indices" do
    Plankton::MAX_NODES.times { solid }
    expect_raises(ArgumentError) { solid }
    expect_raises(ArgumentError) { Plankton::Output.new(4) }
  end

  it "serializes the versioned protocol" do
    solid(1, 0.5, 0).out(o2)
    render(o2)
    value = JSON.parse(Plankton.graph.to_json)
    value["version"].as_i.should eq(1)
    value["display"].as_i.should eq(2)
    value["outputs"][2].as_i.should eq(0)
    value["nodes"][0]["args"][0]["value"].as_f.should eq(1.0)
  end

  it "requires an explicit output" do
    expect_raises(ArgumentError) { Plankton.emit }
  end
end
