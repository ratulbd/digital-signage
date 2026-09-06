# Database Schema Reference

## Contents
- [Prisma Models](#prisma-models)
- [Entity Relationships](#entity-relationships)

## Prisma Models

### Company
```prisma
model Company {
  id        String   @id @default(uuid())
  name      String   @unique
  circles   Circle[]
  users     User[]
  media     Media[]
  schedules ScheduleItem[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Circle
```prisma
model Circle {
  id         String   @id @default(uuid())
  name       String
  companyId  String
  company    Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  subcenters Subcenter[]
  users      User[]
  media      Media[]
  schedules  ScheduleItem[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

### Subcenter
```prisma
model Subcenter {
  id        String   @id @default(uuid())
  name      String
  circleId  String?
  circle    Circle?  @relation(fields: [circleId], references: [id], onDelete: Cascade)
  users     User[]
  devices   Device[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### User
```prisma
model User {
  id                 String   @id @default(uuid())
  email              String   @unique
  name               String?
  passwordHash       String
  role               String   @default("SUBCENTER_ADMIN")
  companyId          String?
  company            Company? @relation(fields: [companyId], references: [id])
  circleId           String?
  circle             Circle?  @relation(fields: [circleId], references: [id])
  subcenterId        String?
  subcenter          Subcenter? @relation(fields: [subcenterId], references: [id])
  emailVerified      Boolean  @default(false)
  verificationCode   String?
  mustChangePassword Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  media              Media[]
  schedules          ScheduleItem[]
}
```

### Device
```prisma
model Device {
  id            String            @id @default(uuid())
  name          String
  subcenterId   String
  subcenter     Subcenter         @relation(fields: [subcenterId], references: [id], onDelete: Cascade)
  lastHeartbeat DateTime          @default(now())
  isOnline      Boolean           @default(false)
  socketId      String?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  scheduleItems ScheduleItem[]    @relation("DeviceSchedules")
  playbackLogs  PlaybackLog[]
  heartbeats    DeviceHeartbeat[]
}
```

### Media
```prisma
model Media {
  id          String         @id @default(uuid())
  filename    String
  url         String
  type        String         @default("IMAGE")
  size        Int
  uploadedBy  String
  uploader    User           @relation(fields: [uploadedBy], references: [id], onDelete: Cascade)
  isPublic    Boolean        @default(false)
  publishedBy String         @default("SUBCENTER")
  companyId   String?
  company     Company?       @relation(fields: [companyId], references: [id])
  circleId    String?
  circle      Circle?        @relation(fields: [circleId], references: [id])
  createdAt   DateTime       @default(now())
  schedules   ScheduleItem[]
  playbackLogs PlaybackLog[]
}
```

### ScheduleItem
```prisma
model ScheduleItem {
  id          String   @id @default(uuid())
  mediaId     String
  media       Media    @relation(fields: [mediaId], references: [id], onDelete: Cascade)
  tier        String   @default("TIER_3")
  deviceIds   Device[] @relation("DeviceSchedules")
  startDate   DateTime?
  endDate     DateTime?
  startTime   String?
  endTime     String?
  isRecurring Boolean  @default(false)
  isActive    Boolean  @default(true)
  createdBy   String
  creator     User     @relation(fields: [createdBy], references: [id], onDelete: Cascade)
  companyId   String?
  company     Company? @relation(fields: [companyId], references: [id])
  circleId    String?
  circle      Circle?  @relation(fields: [circleId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### PlaybackLog
```prisma
model PlaybackLog {
  id        String   @id @default(uuid())
  deviceId  String
  device    Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  mediaId   String
  media     Media    @relation(fields: [mediaId], references: [id])
  tier      String   @default("TIER_3")
  startedAt DateTime @default(now())
  endedAt   DateTime?
  completed Boolean  @default(false)
}
```

### DeviceHeartbeat
```prisma
model DeviceHeartbeat {
  id        String   @id @default(uuid())
  deviceId  String
  device    Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  timestamp DateTime @default(now())
  isOnline  Boolean  @default(true)
}
```

## Entity Relationships

```
Company 1--* Circle
Company 1--* User
Company 1--* Media
Company 1--* ScheduleItem

Circle  *--1 Company
Circle  1--* Subcenter
Circle  1--* User
Circle  1--* Media
Circle  1--* ScheduleItem

Subcenter *--1 Circle
Subcenter 1--* User
Subcenter 1--* Device

User *--1 Company
User *--1 Circle
User *--1 Subcenter
User 1--* Media (uploaded)
User 1--* ScheduleItem (created)

Device *--1 Subcenter
Device *--* ScheduleItem
Device 1--* PlaybackLog
Device 1--* DeviceHeartbeat

Media *--1 User (uploader)
Media *--1 Company
Media *--1 Circle
Media 1--* ScheduleItem
Media 1--* PlaybackLog

ScheduleItem *--1 Media
ScheduleItem *--* Device
ScheduleItem *--1 User (creator)
ScheduleItem *--1 Company
ScheduleItem *--1 Circle
```
