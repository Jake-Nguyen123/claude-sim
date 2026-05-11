# Native helpers for claude-sim — iOS Simulator framebuffer mirror + HID input.
# Both helpers dlopen CoreSimulator/SimulatorKit at runtime so the build itself
# has no private-framework link-time dependency.

SWIFT      := xcrun swiftc
CLANG      := xcrun clang
PRIV_FW    := /Library/Developer/PrivateFrameworks

BIN_DIR    := bin
CAPTURE    := $(BIN_DIR)/sim-capture
INPUT      := $(BIN_DIR)/sim-input

.PHONY: all clean run-capture verify

all: $(CAPTURE) $(INPUT)

$(BIN_DIR):
	@mkdir -p $(BIN_DIR)

$(CAPTURE): sim-capture.swift | $(BIN_DIR)
	$(SWIFT) -O -F $(PRIV_FW) \
		-framework CoreImage -framework Foundation -framework IOSurface \
		sim-capture.swift -o $@

$(INPUT): sim-input.m | $(BIN_DIR)
	$(CLANG) -fobjc-arc -O2 \
		-framework Foundation -framework CoreGraphics \
		sim-input.m -o $@

clean:
	rm -rf $(BIN_DIR)

# Quick sanity check — captures ~2 seconds of frames from any booted simulator.
verify: $(CAPTURE)
	@echo "Make sure an iOS simulator is booted (xcrun simctl boot ...) first."
	@./$(CAPTURE) > /tmp/claude-sim-verify.bin 2> /tmp/claude-sim-verify.err &
	@CAPTURE_PID=$$! ; sleep 2 ; kill -TERM $$CAPTURE_PID 2>/dev/null ; wait $$CAPTURE_PID 2>/dev/null
	@SIZE=$$(wc -c < /tmp/claude-sim-verify.bin) ; \
		if [ "$$SIZE" -gt 1000 ]; then \
			echo "PASS — captured $$SIZE bytes" ; \
			head -1 /tmp/claude-sim-verify.err ; \
		else \
			echo "FAIL — only $$SIZE bytes captured. Stderr:" ; \
			cat /tmp/claude-sim-verify.err ; \
			exit 1 ; \
		fi
	@rm -f /tmp/claude-sim-verify.bin /tmp/claude-sim-verify.err
