APP_NAME=MarketplaceChat.app
APP_SOURCES=index.html index.js marketplace.js style.css
RESOURCES=$(wildcard app-resources/*)

all: $(APP_NAME).zip

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
