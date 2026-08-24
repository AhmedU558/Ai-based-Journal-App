package com.aijournal.ai.dto;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class ContentRequestTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    @Test
    void validate_BlankContent_FailsWithConstraintViolation() {
        ContentRequest request = new ContentRequest();
        request.setContent("   ");

        Set<ConstraintViolation<ContentRequest>> violations = validator.validate(request);

        assertThat(violations).isNotEmpty();
    }

    @Test
    void validate_NullContent_FailsWithConstraintViolation() {
        ContentRequest request = new ContentRequest();

        Set<ConstraintViolation<ContentRequest>> violations = validator.validate(request);

        assertThat(violations).isNotEmpty();
    }

    @Test
    void validate_ContentOverLengthLimit_FailsWithConstraintViolation() {
        ContentRequest request = new ContentRequest();
        request.setContent("a".repeat(20_001));

        Set<ConstraintViolation<ContentRequest>> violations = validator.validate(request);

        assertThat(violations).isNotEmpty();
    }

    @Test
    void validate_RealContent_PassesWithNoViolations() {
        ContentRequest request = new ContentRequest();
        request.setContent("A real journal entry.");

        Set<ConstraintViolation<ContentRequest>> violations = validator.validate(request);

        assertThat(violations).isEmpty();
    }
}
