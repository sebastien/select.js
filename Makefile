##  SDK Bootstrapping
SDK_PATH=deps/sdk
MODULES=std js mise

# Get SDK_URL from environment if possible
ifeq ($(origin SDK_URL), undefined)
  SDK_URL := git@github.com:littletoolkit/littlesdk.git
endif

# Ensure later subshells also receive it
MAKEOVERRIDES += SDK_URL=$(SDK_URL)
export SDK_URL

ifeq ($(wildcard $(SDK_PATH)),)
$(info --→ [SDK] Installing SDK from: $(SDK_URL))
_:=$(shell mkdir -p "$(dir $(SDK_PATH))" || true; git clone "$(SDK_URL)" "$(SDK_PATH)")
endif

include $(SDK_PATH)/src/mk/sdk.mk
# EOF
