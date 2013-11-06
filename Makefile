APP_NAME=MarketplaceChat.app
APP_SOURCES=index.html index.js marketplace.js style.css
RESOURCES=$(wildcard app-resources/*)

all: $(APP_NAME).zip

keys: private-key.pem server-cert.pem

private-key.pem:
	openssl genrsa -des3 -passout pass:a -out $@ 1024
	openssl rsa -passin pass:a -in $@ -out $@

server-cert.pem: private-key.pem
	openssl req -new -x509 -nodes -sha1 -days 365 \
		-subj /CN=chat-demo.js-marketplace.leastfixedpoint.com \
		-passin pass:a \
		-key private-key.pem > $@

clean-keys:
	rm -f private-key.pem server-cert.pem

$(APP_NAME).zip: $(APP_NAME)
	zip -r $@ $<

$(APP_NAME): $(APP_SOURCES)
	echo RESOURCES $(RESOURCES)
	rm -rf $@
	mkdir -p $@/Contents/MacOS
	mkdir -p $@/Contents/Resources
	cp app-resources/Info.plist $@/Contents
	cp app-resources/boot.sh $@/Contents/MacOS
	cp app-resources/app.icns $@/Contents/Resources
	cp -r bootstrap $@/Contents/Resources
	cp jquery*js $@/Contents/Resources
	cp $(APP_SOURCES) $@/Contents/Resources
	chmod a+x $@/Contents/MacOS/boot.sh

clean:
	rm -rf $(APP_NAME) $(APP_NAME).zip
