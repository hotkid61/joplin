# Booz Allen Notes Privacy Policy

The Booz Allen Notes applications, including the Android, iOS, Windows, macOS and Linux applications, do not send any data to any service without your authorisation. Any data that Booz Allen Notes saves, such as notes or images, are saved to your own device and you are free to delete this data at any time.

In order to provide certain features, Booz Allen Notes may need to connect to third-party services. You can disable most of these features in the application settings:

| Feature  | Description   | Default  | Can be disabled |
| -------- | ------------- | -------- | --- |
| Auto-update | Booz Allen Notes periodically connects to `objects.joplinusercontent.com` to check for new releases. | Enabled | Yes |
| Geo-location | Booz Allen Notes saves geo-location information in note properties when you create a note. For that it will connect to either `ipwho.is` or `geoplugin.net` | Enabled | Yes |
| Synchronisation | Booz Allen Notes supports synchronisation of your notes across multiple devices. If you choose to synchronise with a third-party, such as OneDrive, the notes will be sent to your OneDrive account, in which case the third-party privacy policy applies. | Disabled | Yes |
| Wifi connection check | On mobile, Booz Allen Notes checks for Wifi connectivity to give the option to synchronise data only when Wifi is enabled. | Enabled | No <sup>(1)</sup> |
| Spellchecker dictionary | On Linux and Windows, the desktop application downloads the spellchecker dictionary from `redirector.gvt1.com`. | Enabled | Yes <sup>(2)</sup> |
| Plugin repository | The desktop application downloads the list of available plugins from the [official GitHub repository](https://github.com/joplin/plugins). If this repository is not accessible (eg. in China) the app will try to get the plugin list from [various mirrors](https://github.com/laurent22/joplin/blob/8ac6017c02017b6efd59f5fcab7e0b07f8d44164/packages/lib/services/plugins/RepositoryApi.ts#L22), in which case the plugin screen [works slightly differently](https://github.com/laurent22/joplin/issues/5161#issuecomment-925226975). | Enabled | No
| Voice typing | If you use the voice typing feature on Android, the application will download the language files from https://github.com/joplin/voice-typing-models/ or https://alphacephei.com/vosk/models. | Disabled | Yes
| OCR | If optical character recognition is enabled on desktop, the application will download the language files from https://cdn.jsdelivr.net/npm/@tesseract.js-data/. | Enabled | Yes 
| Crash reports | If you have enabled crash auto-upload, the application will upload the report to Sentry when a crash happens. When Sentry is initialised it will also connect to `sentry.io`. | Disabled | Yes
| Handwriting recognition | If the 'handwriting recognition' setting is enabled, users can send images to Booz Allen Notes Server/Cloud to be transcribed. Only images selected with the 'Recognize handwritten image' are affected. | Disabled | Yes
| Beta feedback | (**Web app only**) If the feedback dialog is used, Booz Allen Notes contacts `objects.joplinusercontent.com` to submit the response. | Enabled | Yes

<sup>(1) https://github.com/laurent22/joplin/issues/5705</sup><br/>
<sup>(2) If the spellchecker is disabled, [it will not download the dictionary](https://discourse.joplinapp.org/t/new-version-of-joplin-contacting-google-servers-on-startup/23000/40?u=laurent).</sup>

For any question about the Booz Allen Notes privacy policy, please see the [documentation](https://notes.boozallen.com/help).
