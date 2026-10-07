-- loe_vehicledesigner tabloları. Resource ilk açılışta bunları kendisi oluşturur; bu dosya elle kurulum içindir.

CREATE TABLE IF NOT EXISTS `loe_vd_designs` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `owner` VARCHAR(64) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `model` VARCHAR(16) NULL,
    `model_label` VARCHAR(64) NULL,
    `data` LONGTEXT NOT NULL,
    `thumb` MEDIUMTEXT NULL,
    `rev` INT NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `owner` (`owner`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `loe_vd_assignments` (
    `scope` VARCHAR(8) NOT NULL,
    `key` VARCHAR(32) NOT NULL,
    `model` VARCHAR(16) NULL,
    `model_label` VARCHAR(64) NULL,
    `design_id` INT NOT NULL,
    `set_by` VARCHAR(64) NULL,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`scope`, `key`),
    KEY `design_id` (`design_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `loe_vd_images` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `owner` VARCHAR(64) NOT NULL,
    `data` LONGTEXT NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `owner` (`owner`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
