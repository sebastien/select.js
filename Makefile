##  SDK Bootstrapping
SDK_PATH=deps/sdk
MODULES=std js mise
include $(if $(SDK_PATH),$(shell test ! -e "$(SDK_PATH)/setup.mk" && git clone git@github.com:sebastien/sdk.mk.git "$(SDK_PATH)";echo "$(SDK_PATH)/setup.mk"))
# EOF
