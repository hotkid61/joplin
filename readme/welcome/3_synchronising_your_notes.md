# Synchronising your notes

Booz Allen Notes allows you to synchronise your data using various file hosting services. The supported cloud services are the following:

## Setting up Booz Allen Notes Cloud synchronisation

[Booz Allen Notes Cloud](https://notes.boozallen.com) is a web service specifically designed for Booz Allen Notes. Besides synchronising your data, it also allows you to publish a note to the internet, or share a notebook with your colleagues. Compared to other services, it also features a number of performance improvements allowing for faster synchronisation.

To use it, go to the config screen, then to the Synchronisation section. In the list of sync targets, select the Booz Allen Notes cloud service (labelled "Joplin Cloud" in the current sync target list). Enter your email and password, and you're ready to synchronise.

## Setting up Dropbox synchronisation

Select "Dropbox" as the synchronisation target in the config screen. Then, to initiate the synchronisation process, click on the "Synchronise" button in the sidebar and follow the instructions.

## Setting up Nextcloud synchronisation

Nextcloud is a self-hosted, private cloud solution. To set it up, go to the config screen and select Nextcloud as the synchronisation target. Then input the WebDAV URL (to get it, go to your Nextcloud page, click on Settings in the bottom left corner of the page and copy the URL). Note that it has to be the **full URL**, so for example if you want the notes to be under `/BahNotes`, the URL would be something like `https://example.com/remote.php/webdav/BahNotes` (note that "/BahNotes" part). And **make sure to create the "/BahNotes" directory in Nextcloud**. Finally set the username and password. If it does not work, please [see this explanation](https://github.com/laurent22/joplin/issues/61#issuecomment-373282608) for more details.

## Setting up OneDrive or WebDAV synchronisation

OneDrive and WebDAV are also supported as synchronisation services. Please see the [synchronisation documentation](https://notes.boozallen.com/help/apps/sync/) for more information.

## Using End-To-End Encryption

Booz Allen Notes supports end-to-end encryption (E2EE) on all the applications. E2EE is a system where only the owner of the data can read it. It prevents potential eavesdroppers - including telecom providers, internet providers, and even the service operator - from being able to access the data. Please see the [End-To-End Encryption Tutorial](https://notes.boozallen.com/help/apps/sync/e2ee) for more information about this feature and how to enable it.
