package com.aijournal.file.storage;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

public interface FileStorageStrategy {
    String storeFile(MultipartFile file, String path);
    // A Resource, not byte[] - Spring streams this straight from disk to the
    // HTTP response without ever buffering the whole file into JVM heap,
    // unlike a byte[] return which loads the entire file into memory on
    // every single download regardless of size.
    Resource getFile(String path);
    void deleteFile(String path);
    // Removes every file under a directory prefix (e.g. "user-{id}") in one
    // call - used by account deletion, where deleting one file at a time
    // would need the caller to first enumerate every upload the user ever
    // made.
    void deleteDirectory(String subPath);
}
