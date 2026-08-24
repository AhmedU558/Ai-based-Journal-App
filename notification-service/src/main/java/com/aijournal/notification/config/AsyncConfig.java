package com.aijournal.notification.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
public class AsyncConfig {

    // @Async's default executor (SimpleAsyncTaskExecutor) spawns a brand new,
    // never-reused thread per task with no upper bound - trading one problem
    // (a blocked servlet thread per slow SMTP send) for another (unbounded
    // thread creation under a surge of email sends). A bounded pool with a
    // real queue avoids both.
    @Bean(name = "mailExecutor")
    public Executor mailExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(10);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("mail-async-");
        executor.initialize();
        return executor;
    }
}
