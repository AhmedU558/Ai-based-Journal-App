package com.aijournal.file.controller;

import com.aijournal.common.exception.ForbiddenException;
import com.aijournal.file.storage.FileStorageStrategy;
import com.aijournal.file.validation.FileTypeValidator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileControllerTest {

    @Mock
    private FileStorageStrategy fileStorageStrategy;

    @Mock
    private FileTypeValidator fileTypeValidator;

    @InjectMocks
    private FileController fileController;

    @Test
    void uploadFile_StoresUnderUserPrefixedSubPath() {
        MultipartFile file = new MockMultipartFile("file", "photo.jpg", "image/jpeg", "content".getBytes());
        when(fileStorageStrategy.storeFile(file, "user-5")).thenReturn("user-5/uuid.jpg");

        ResponseEntity<?> response = fileController.uploadFile(5L, file);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        verify(fileStorageStrategy).storeFile(file, "user-5");
    }

    @Test
    void downloadFile_OwnPrefixedPath_Succeeds() {
        Resource resource = new ByteArrayResource("content".getBytes());
        when(fileStorageStrategy.getFile("user-5/photo.jpg")).thenReturn(resource);

        ResponseEntity<Resource> response = fileController.downloadFile(5L, "user-5/photo.jpg");

        assertThat(response.getBody()).isEqualTo(resource);
    }

    @Test
    void downloadFile_PathTraversalAttempt_ThrowsForbidden() {
        assertThatThrownBy(() -> fileController.downloadFile(5L, "user-5/../user-6/secret.jpg"))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void downloadFile_AnotherUsersPrefix_ThrowsForbidden() {
        assertThatThrownBy(() -> fileController.downloadFile(5L, "user-6/secret.jpg"))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void downloadFile_PrefixMatchWithoutOwnUserId_ThrowsForbidden() {
        // "user-5x/..." should not satisfy the "user-5/" prefix check via naive startsWith
        // on an un-delimited prefix - regression guard for a subtle prefix-matching bug.
        assertThatThrownBy(() -> fileController.downloadFile(5L, "user-55/secret.jpg"))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void deleteFile_OwnPrefixedPath_Succeeds() {
        ResponseEntity<?> response = fileController.deleteFile(5L, "user-5/old-avatar.jpg");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        verify(fileStorageStrategy).deleteFile("user-5/old-avatar.jpg");
    }

    @Test
    void deleteFile_AnotherUsersPrefix_ThrowsForbidden() {
        assertThatThrownBy(() -> fileController.deleteFile(5L, "user-6/secret.jpg"))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void deleteFile_PathTraversalAttempt_ThrowsForbidden() {
        assertThatThrownBy(() -> fileController.deleteFile(5L, "user-5/../user-6/secret.jpg"))
                .isInstanceOf(ForbiddenException.class);
    }
}
