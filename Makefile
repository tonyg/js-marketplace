APP_NAME=MarketplaceChat.app
LIB_SOURCES=\
	route.js \
	marketplace.js \
	spy.js \
	dom-driver.js \
	jquery-driver.js \
	routing-table-widget.js \
	routing-table-widget.css \
	wake-detector.js \
	websocket-driver.js
APP_SOURCES=\
	examples/chat/index.html \
	examples/chat/index.js \
	examples/chat/style.css
RESOURCES=$(wildcard examples/chat/app-resources/*)

all: $(APP_NAME).zip

keys: private-key.pem server-cert.pem

private-key.pem:
	openssl genrsa -des3 -passout pass:a -out $@ 1024
	openssl rsa -passin pass:a -in $@ -out $@

server-cert.pem: private-key.pem
	openssl req -new -x509 -nodes -sha1 -days 365 \
		-subj /CN=server.minimart.leastfixedpoint.com \
		-passin pass:a \
		-key private-key.pem > $@

clean-keys:
	rm -f private-key.pem server-cert.pem

$(APP_NAME).zip: $(APP_NAME)
	zip -r $@ $<

$(APP_NAME): $(APP_SOURCES) $(LIB_SOURCES)
	echo RESOURCES $(RESOURCES)
	rm -rf $@
	mkdir -p $@/Contents/MacOS
	mkdir -p $@/Contents/Resources
	cp examples/chat/app-resources/Info.plist $@/Contents
	cp examples/chat/app-resources/boot.sh $@/Contents/MacOS
	cp examples/chat/app-resources/app.icns $@/Contents/Resources
	cp -r third-party $@/Contents/Resources
	cp $(LIB_SOURCES) $@/Contents/Resources
	mkdir -p $@/Contents/Resources/examples/chat
	cp $(APP_SOURCES) $@/Contents/Resources/examples/chat
	chmod a+x $@/Contents/MacOS/boot.sh

clean:
	rm -rf $(APP_NAME) $(APP_NAME).zip
