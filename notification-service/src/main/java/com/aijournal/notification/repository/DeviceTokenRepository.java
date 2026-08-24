package com.aijournal.notification.repository;

import com.aijournal.notification.entity.DeviceToken;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DeviceTokenRepository extends JpaRepository<DeviceToken, Long> {
    List<DeviceToken> findByUserId(Long userId);
    Optional<DeviceToken> findByUserIdAndExpoPushToken(Long userId, String expoPushToken);
    @Modifying
    int deleteByUserIdAndExpoPushToken(Long userId, String expoPushToken);

    // Selects only the distinct userId column (not full DeviceToken rows)
    // and pages through it - ReminderScheduler previously called findAll()
    // and loaded every registered device row into heap at once just to
    // extract userIds from it. Slice (not Page) since the scheduler only
    // ever walks forward and never needs a total-count query.
    @Query("SELECT DISTINCT d.userId FROM DeviceToken d ORDER BY d.userId")
    Slice<Long> findDistinctUserIds(Pageable pageable);
}
