require "./plankton/core"
require "./plankton/generated"

# The editor loads this prelude before sketch.cr. The same prelude is usable
# natively: require "./src/plankton"; include Plankton::DSL; ...; Plankton.emit
include Plankton::DSL
