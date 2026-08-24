package com.aijournal.user.dto;

// Request-only shape for PUT /api/v1/users/profile - the controller used to
// deserialize the client's JSON straight onto the UserProfile JPA entity,
// including userId (the @Id/primary key) and createdAt/updatedAt. Not
// currently reachable as a real exploit (UserServiceImpl.updateProfile
// resolves the target row via the trusted header-derived userId, never the
// request body's), but this DTO makes those fields structurally impossible
// to send in the first place rather than relying on the service layer never
// changing to read them.
public class UserProfileRequest {

    private String bio;
    private String avatarUrl;
    private String phoneNumber;
    private String country;
    private String city;

    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }
    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }
    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
}
