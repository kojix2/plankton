require "json"

# A typed, one-shot video-graph builder. Rendering runs in WebGL, not in a
# Crystal draw loop. Graph version 1 is intentionally independent of JavaScript.
module Hydra
  VERSION       = "0.1.0"
  GRAPH_VERSION =   1
  MAX_NODES     = 128
  MAX_PARAMS    =  16
  SENTINEL      = "__HYDRA_CRYSTAL_GRAPH_V1__"

  alias Scalar = Int::Primitive | Float::Primitive | Signal

  # A uniform expression, evaluated on the GPU on every frame.
  struct Signal
    getter op : String
    getter args : Array(Signal)
    getter value : Float64
    getter key : String

    def initialize(@op : String, @args = [] of Signal, @value = 0.0, @key = "")
    end

    def self.cast(value : Number) : Signal
      number = value.to_f64
      unless number.finite? && number.abs <= 1.0e9
        raise ArgumentError.new("A signal constant must be finite and within ±1e9")
      end
      new("const", value: number)
    end

    def self.cast(value : Signal) : Signal
      value
    end

    def +(other : Scalar) : Signal
      Signal.new("add", [self, Signal.cast(other)])
    end

    def -(other : Scalar) : Signal
      Signal.new("sub", [self, Signal.cast(other)])
    end

    def *(other : Scalar) : Signal
      Signal.new("mul", [self, Signal.cast(other)])
    end

    def /(other : Scalar) : Signal
      Signal.new("div", [self, Signal.cast(other)])
    end

    def - : Signal
      Signal.new("neg", [self])
    end

    def sin : Signal
      Signal.new("sin", [self])
    end

    def cos : Signal
      Signal.new("cos", [self])
    end

    def abs : Signal
      Signal.new("abs", [self])
    end

    def floor : Signal
      Signal.new("floor", [self])
    end

    def fract : Signal
      Signal.new("fract", [self])
    end

    def sqrt : Signal
      Signal.new("sqrt", [self])
    end

    def pow(exponent : Scalar) : Signal
      Signal.new("pow", [self, Signal.cast(exponent)])
    end

    def min(other : Scalar) : Signal
      Signal.new("min", [self, Signal.cast(other)])
    end

    def max(other : Scalar) : Signal
      Signal.new("max", [self, Signal.cast(other)])
    end

    def clamp(low : Scalar = 0.0, high : Scalar = 1.0) : Signal
      Signal.new("clamp", [self, Signal.cast(low), Signal.cast(high)])
    end

    def lerp(other : Scalar, amount : Scalar) : Signal
      Signal.new("mix", [self, Signal.cast(other), Signal.cast(amount)])
    end

    def map(in_low : Scalar, in_high : Scalar, out_low : Scalar, out_high : Scalar) : Signal
      start = Signal.cast(out_low)
      start + (self - in_low) / (Signal.cast(in_high) - in_low) * (Signal.cast(out_high) - start)
    end

    def to_json(json : JSON::Builder) : Nil
      json.object do
        json.field "op", @op
        case @op
        when "const", "fft"
          json.field "value", @value
        when "param"
          json.field "key", @key
        else
          json.field "args", @args unless @args.empty?
        end
      end
    end
  end

  struct Mouse
    def x : Signal
      Signal.new("mouse_x")
    end

    def y : Signal
      Signal.new("mouse_y")
    end
  end

  struct Output
    getter index : Int32

    def initialize(@index : Int32)
      raise ArgumentError.new("Output must be o0, o1, o2 or o3") unless (0..3).includes?(@index)
    end
  end

  # Input slots are populated by explicit browser UI actions, never by a sketch.
  struct Input
    getter index : Int32

    def initialize(@index : Int32)
      raise ArgumentError.new("Input must be s0, s1, s2 or s3") unless (0..3).includes?(@index)
    end
  end

  struct Audio
    def fft(index : Int32) : Signal
      raise ArgumentError.new("FFT band must be 0–31") unless (0..31).includes?(index)
      Signal.new("fft", value: index.to_f64)
    end

    def level : Signal
      Signal.new("audio_level")
    end
  end

  record Parameter, key : String, value : Float64, min : Float64, max : Float64, step : Float64 do
    def to_json(json : JSON::Builder) : Nil
      json.object do
        json.field "key", key
        json.field "value", value
        json.field "min", min
        json.field "max", max
        json.field "step", step
      end
    end
  end

  record Node, op : String, args : Array(Signal), inputs : Array(Int32) do
    def to_json(json : JSON::Builder) : Nil
      json.object do
        json.field "op", op
        json.field "args", args
        json.field "inputs", inputs
      end
    end
  end

  class Graph
    getter nodes = [] of Node
    getter params = [] of Parameter
    getter outputs = Array(Int32?).new(4, nil)
    property display : Int32 = 0

    def add(op : String, args : Array(Signal), inputs = [] of Int32) : Texture
      raise ArgumentError.new("A sketch may contain at most #{MAX_NODES} nodes") if @nodes.size >= MAX_NODES
      @nodes << Node.new(op, args, inputs)
      Texture.new(self, @nodes.size - 1)
    end

    def param(key : String, value : Number, min : Number, max : Number, step : Number) : Signal
      unless key.matches?(/\A[a-zA-Z][a-zA-Z0-9_]{0,31}\z/)
        raise ArgumentError.new("Parameter names must use letters, numbers or underscores, starting with a letter")
      end
      values = [value, min, max, step].map(&.to_f64)
      unless values.all? { |number| number.finite? && number.abs <= 1.0e9 }
        raise ArgumentError.new("Parameter bounds must be finite and within ±1e9")
      end
      initial, lower, upper, increment = values
      unless lower < upper && initial >= lower && initial <= upper && increment > 0
        raise ArgumentError.new("Invalid parameter range or step")
      end
      parameter = Parameter.new(key, initial, lower, upper, increment)
      if previous = @params.find { |entry| entry.key == key }
        raise ArgumentError.new("Conflicting definitions for parameter #{key}") unless previous == parameter
      else
        raise ArgumentError.new("At most #{MAX_PARAMS} parameters are supported") if @params.size >= MAX_PARAMS
        @params << parameter
      end
      Signal.new("param", key: key)
    end

    def to_json(json : JSON::Builder) : Nil
      json.object do
        json.field "version", GRAPH_VERSION
        json.field "nodes", @nodes
        json.field "outputs", @outputs
        json.field "display", @display
        json.field "params", @params
      end
    end
  end

  class Texture
    getter graph : Graph
    getter id : Int32

    def initialize(@graph : Graph, @id : Int32)
    end

    protected def transform(op : String, args : Array(Signal)) : Texture
      @graph.add(op, args, [@id])
    end

    protected def combine(op : String, other : Texture, args : Array(Signal)) : Texture
      raise ArgumentError.new("Cannot mix textures from different graphs") unless other.graph.same?(@graph)
      @graph.add(op, args, [@id, other.id])
    end

    def out(output : Output = Output.new(0)) : Texture
      @graph.outputs[output.index] = @id
      self
    end
  end

  @@graph = Graph.new

  def self.graph : Graph
    @@graph
  end

  def self.reset : Nil
    @@graph = Graph.new
  end

  def self.emit : Nil
    raise ArgumentError.new("No output: finish a texture chain with .out") if @@graph.outputs.all?(Nil)
    puts SENTINEL + @@graph.to_json
  end

  module DSL
    def time : Signal
      Signal.new("time")
    end

    def frame : Signal
      Signal.new("frame")
    end

    def delta : Signal
      Signal.new("delta")
    end

    def beat : Signal
      Signal.new("beat")
    end

    def audio : Audio
      Audio.new
    end

    def s0 : Input
      Input.new(0)
    end

    def s1 : Input
      Input.new(1)
    end

    def s2 : Input
      Input.new(2)
    end

    def s3 : Input
      Input.new(3)
    end

    def mouse : Mouse
      Mouse.new
    end

    def param(key : String, value : Number, min : Number = 0.0, max : Number = 1.0, step : Number = 0.01) : Signal
      Hydra.graph.param(key, value, min, max, step)
    end

    def o0 : Output
      Output.new(0)
    end

    def o1 : Output
      Output.new(1)
    end

    def o2 : Output
      Output.new(2)
    end

    def o3 : Output
      Output.new(3)
    end

    # Output references are previous-frame textures, including self-feedback.
    def src(output : Output = Output.new(0)) : Texture
      Hydra.graph.add("src", [Signal.cast(output.index)])
    end

    def src(input : Input) : Texture
      Hydra.graph.add("input", [Signal.cast(input.index)])
    end

    def render(output : Output = Output.new(0)) : Nil
      Hydra.graph.display = output.index
    end

    def sin(value : Scalar) : Signal
      Signal.cast(value).sin
    end

    def cos(value : Scalar) : Signal
      Signal.cast(value).cos
    end

    def constrain(value : Scalar, low : Scalar = 0.0, high : Scalar = 1.0) : Signal
      Signal.cast(value).clamp(low, high)
    end

    def lerp(first : Scalar, second : Scalar, amount : Scalar) : Signal
      Signal.cast(first).lerp(second, amount)
    end

    def map(value : Scalar, in_low : Scalar, in_high : Scalar, out_low : Scalar, out_high : Scalar) : Signal
      Signal.cast(value).map(in_low, in_high, out_low, out_high)
    end
  end
end

# Only the Signal overload is added. Numeric arithmetic retains its original
# meaning. This makes both `time * 2` and `2 * time` natural in Crystal.
abstract struct Number
  def +(other : Hydra::Signal) : Hydra::Signal
    Hydra::Signal.cast(self) + other
  end

  def -(other : Hydra::Signal) : Hydra::Signal
    Hydra::Signal.cast(self) - other
  end

  def *(other : Hydra::Signal) : Hydra::Signal
    Hydra::Signal.cast(self) * other
  end

  def /(other : Hydra::Signal) : Hydra::Signal
    Hydra::Signal.cast(self) / other
  end
end
