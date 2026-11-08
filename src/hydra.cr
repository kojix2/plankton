require "./hydra/core"
require "./hydra/generated"

# The editor loads this prelude before sketch.cr. The same prelude is usable
# natively: require "./src/hydra"; include Hydra::DSL; ...; Hydra.emit
include Hydra::DSL
