-- Database: db_manager
-- Export: 2026-08-06T12:44:44.521Z

CREATE DATABASE IF NOT EXISTS `db_manager`;
USE `db_manager`;

DROP TABLE IF EXISTS `connections`;
CREATE TABLE `connections` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `host` varchar(255) NOT NULL,
  `port` int(11) DEFAULT 3306,
  `username` varchar(255) NOT NULL,
  `password` text NOT NULL,
  `database_name` varchar(255) DEFAULT '',
  `ssl` tinyint(1) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_connections_user` (`user_id`),
  CONSTRAINT `fk_connections_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


DROP TABLE IF EXISTS `saved_queries`;
CREATE TABLE `saved_queries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `query_text` longtext NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_saved_queries_user` (`user_id`),
  CONSTRAINT `fk_saved_queries_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `users` (`id`, `username`, `password_hash`, `created_at`) VALUES (1, 'mohit', '$2b$10$HAius6IDjOR.2R8kVm7R9.0JgOHMs..MEH4vUJNujAkBm//0fihRS', '2026-06-22 20:54:44');
INSERT INTO `users` (`id`, `username`, `password_hash`, `created_at`) VALUES (6, 'kumar', '$2b$10$hzRKm90tK3pBO95TsxC25uW3FronyaZ/7FS1o4avXyvy7sqOMFLta', '2026-08-06 18:06:03');


INSERT INTO `connections` (`id`, `user_id`, `name`, `host`, `port`, `username`, `password`, `database_name`, `ssl`, `created_at`) VALUES (1, 1, 'hrms_prod', '145.223.23.169', 3306, 'zero_hrms', 'HRMS@2026', 'zero_HRMS', 0, '2026-08-06 18:10:31');
INSERT INTO `connections` (`id`, `user_id`, `name`, `host`, `port`, `username`, `password`, `database_name`, `ssl`, `created_at`) VALUES (2, 1, 'TiDB', 'gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com', 4000, '3qMsEBXG7eXrGVb.root', 'GE2arWsQX1eoK2Js', 'sys', 1, '2026-08-06 18:11:40');
INSERT INTO `connections` (`id`, `user_id`, `name`, `host`, `port`, `username`, `password`, `database_name`, `ssl`, `created_at`) VALUES (3, 1, 'local_db', 'localhost', 3306, 'kali_admin', 'password', '', 0, '2026-08-06 18:12:57');

