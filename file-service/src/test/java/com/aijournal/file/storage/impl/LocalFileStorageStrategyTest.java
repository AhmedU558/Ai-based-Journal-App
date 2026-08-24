package com.aijournal.file.storage.impl;

import com.aijournal.common.exception.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

class LocalFileStorageStrategyTest {

    @TempDir
    Path tempDir;

    private LocalFileStorageStrategy strategy;

    @BeforeEach
    void setUp() {
        strategy = new LocalFileStorageStrategy();
        ReflectionTestUtils.setField(strategy, "uploadDir", tempDir.toString());
    }

    @Test
    void storeFile_WithExtension_GeneratesUuidFilenamePreservingExtension() throws IOException {
        MultipartFile file = new MockMultipartFile("file", "photo.jpg", "image/jpeg", "content".getBytes());

        String storedPath = strategy.storeFile(file, "user-1");

        assertThat(storedPath).startsWith("user-1/").endsWith(".jpg");
        String fileName = storedPath.substring(storedPath.indexOf('/') + 1);
        assertThat(fileName).matches("^[0-9a-f-]{36}\\.jpg$");
        assertThat(Files.exists(tempDir.resolve("user-1").resolve(fileName))).isTrue();
    }

    @Test
    void storeFile_NoExtension_GeneratesFilenameWithoutExtension() {
        MultipartFile file = new MockMultipartFile("file", "noext", "application/octet-stream", "content".getBytes());

        String storedPath = strategy.storeFile(file, "user-2");

        String fileName = storedPath.substring(storedPath.indexOf('/') + 1);
        assertThat(fileName).doesNotContain(".").matches("^[0-9a-f-]{36}$");
    }

    @Test
    void storeFile_MissingTargetDirectory_CreatesItAutomatically() {
        MultipartFile file = new MockMultipartFile("file", "a.txt", "text/plain", "content".getBytes());

        strategy.storeFile(file, "user-3/nested");

        assertThat(Files.isDirectory(tempDir.resolve("user-3").resolve("nested"))).isTrue();
    }

    @Test
    void storeFile_TransferThrowsIOException_ThrowsBadRequestException() throws IOException {
        MultipartFile file = Mockito.mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("photo.jpg");
        doThrow(new IOException("disk full")).when(file).transferTo(any(Path.class));

        assertThatThrownBy(() -> strategy.storeFile(file, "user-4"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void getFile_ExistingFile_ReturnsReadableResource() throws IOException {
        Path stored = tempDir.resolve("user-5");
        Files.createDirectories(stored);
        Path filePath = stored.resolve("hello.txt");
        Files.writeString(filePath, "hello world");

        Resource result = strategy.getFile("user-5/hello.txt");

        assertThat(result.exists()).isTrue();
        assertThat(result.isReadable()).isTrue();
        // try-with-resources: an unclosed stream holds a Windows file-handle
        // lock that fails @TempDir's post-test directory cleanup.
        try (var in = result.getInputStream()) {
            assertThat(new String(in.readAllBytes())).isEqualTo("hello world");
        }
    }

    @Test
    void getFile_MissingFile_ThrowsBadRequestException() {
        assertThatThrownBy(() -> strategy.getFile("user-6/does-not-exist.txt"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void deleteFile_ExistingFile_RemovesIt() throws IOException {
        Path stored = tempDir.resolve("user-7");
        Files.createDirectories(stored);
        Path filePath = stored.resolve("to-delete.txt");
        Files.writeString(filePath, "bye");

        strategy.deleteFile("user-7/to-delete.txt");

        assertThat(Files.exists(filePath)).isFalse();
    }

    @Test
    void deleteFile_NonExistentFile_DoesNotThrow() {
        assertThatCode(() -> strategy.deleteFile("user-8/never-existed.txt"))
                .doesNotThrowAnyException();
    }
}
