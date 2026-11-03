-- AEVORIO 唯一的 MySQL 结构与示例数据文件。全部业务表仅存在于 aevorio 数据库。
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS `aevorio` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `aevorio`;

CREATE TABLE IF NOT EXISTS `site_settings` (
  `setting_key` VARCHAR(64) NOT NULL COMMENT '全站设置的唯一键',
  `setting_value` JSON NOT NULL COMMENT '网站名称、公司示例名称及语言',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '配置更新时间',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '乐观并发版本',
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `pages` (
  `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '正式网页的自增主键',
  `slug` ENUM('home', 'products', 'about') NOT NULL COMMENT '仅支持三个正式页面标识',
  `title` VARCHAR(120) NOT NULL COMMENT '网站导航和网页标题',
  `meta_description` VARCHAR(255) NOT NULL COMMENT '页面搜索摘要',
  `is_visible` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '页面是否公开显示',
  `og_title` VARCHAR(240) NOT NULL DEFAULT '' COMMENT '分享标题',
  `og_description` TEXT NULL COMMENT '分享说明',
  `og_media_id` VARCHAR(96) NULL COMMENT '分享图资源标识',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '乐观并发版本',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pages_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `media_assets` (
  `id` VARCHAR(96) NOT NULL COMMENT '页面图片或单个产品主图的稳定标识',
  `resource_key` VARCHAR(96) NOT NULL COMMENT '供维护人员识别的资源名称',
  `file_name` VARCHAR(180) NOT NULL COMMENT '后端本地媒体文件名称',
  `relative_path` VARCHAR(220) NOT NULL COMMENT '相对于 backend/storage 的媒体路径',
  `mime_type` VARCHAR(80) NOT NULL COMMENT '图片真实媒体类型',
  `file_size` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '媒体文件实际字节数',
  `width` SMALLINT UNSIGNED NOT NULL COMMENT '位图像素宽度',
  `height` SMALLINT UNSIGNED NOT NULL COMMENT '位图像素高度',
  `sha256` CHAR(64) NOT NULL COMMENT '媒体文件 SHA-256 校验值',
  `alt_text` VARCHAR(255) NOT NULL COMMENT '辅助技术可读取的简体中文图片说明',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '资源创建时间',
  `caption` VARCHAR(240) NOT NULL DEFAULT '' COMMENT '图片说明',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '乐观并发版本',
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '可恢复删除状态',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_media_resource` (`resource_key`),
  KEY `idx_media_filename` (`file_name`),
  KEY `idx_media_relative_path` (`relative_path`),
  KEY `idx_media_sha256` (`sha256`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `page_sections` (
  `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '页面内容板块主键',
  `page_id` SMALLINT UNSIGNED NOT NULL COMMENT '所属正式页面编号',
  `section_key` VARCHAR(64) NOT NULL COMMENT '页面内稳定唯一的板块标识',
  `section_type` VARCHAR(48) NOT NULL COMMENT '用于区别专题排版形式的板块类型',
  `title` VARCHAR(180) NOT NULL COMMENT '板块主标题',
  `subtitle` VARCHAR(240) NOT NULL DEFAULT '' COMMENT '说明板块主题的短句',
  `description` TEXT NOT NULL COMMENT '具体的板块介绍',
  `content_json` JSON NOT NULL COMMENT '可独立编辑的专题标签和展示信息',
  `media_id` VARCHAR(96) NULL COMMENT '本板块使用的后端本地媒体资源',
  `sort_order` SMALLINT UNSIGNED NOT NULL COMMENT '页面内稳定排列顺序',
  `is_visible` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否向访客展示',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '板块创建时间',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '板块最近维护时间',
  `category_id` VARCHAR(64) NULL COMMENT '产品目录的类别稳定标识',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '乐观并发版本',
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '可恢复删除状态',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_section_key` (`page_id`, `section_key`),
  KEY `idx_sections_order` (`page_id`, `is_visible`, `sort_order`, `id`),
  CONSTRAINT `fk_sections_page` FOREIGN KEY (`page_id`) REFERENCES `pages` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_sections_media` FOREIGN KEY (`media_id`) REFERENCES `media_assets` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `product_categories` (
  `id` VARCHAR(64) NOT NULL COMMENT '产品类别的稳定标识',
  `slug` VARCHAR(64) NOT NULL COMMENT '用于页面锚点和前端分类识别的唯一键',
  `name` VARCHAR(96) NOT NULL COMMENT '产品类别简体中文名称',
  `description` VARCHAR(200) NOT NULL COMMENT '类别定位及适用方向',
  `sort_order` SMALLINT UNSIGNED NOT NULL COMMENT '产品类别显示顺序',
  `is_visible` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否显示该类别',
  `media_id` VARCHAR(96) NULL COMMENT '类别图片',
  `icon` VARCHAR(96) NOT NULL DEFAULT 'CircuitBoard' COMMENT '类别图标',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '乐观并发版本',
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '可恢复删除状态',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categories_slug` (`slug`),
  KEY `idx_categories_order` (`is_visible`, `sort_order`, `id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `products` (
  `id` VARCHAR(96) NOT NULL COMMENT '独立示例产品的稳定标识',
  `slug` VARCHAR(96) NOT NULL COMMENT '产品唯一路径键，不创建独立网页路由',
  `category_id` VARCHAR(64) NOT NULL COMMENT '产品所属的真实唯一类别',
  `name` VARCHAR(128) NOT NULL COMMENT '示例产品名称',
  `subtitle` VARCHAR(180) NOT NULL COMMENT '产品特性短句',
  `description` TEXT NOT NULL COMMENT '产品技术用途说明',
  `primary_media_id` VARCHAR(96) NOT NULL COMMENT '与本产品一对一关联的唯一主图',
  `specifications_json` JSON NOT NULL COMMENT '供同页产品弹窗读取的技术方向说明',
  `features_json` JSON NOT NULL COMMENT '本产品具有区分度的展示要点',
  `sort_order` SMALLINT UNSIGNED NOT NULL COMMENT '所属类别中的稳定产品顺序',
  `is_demo` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '明确标记该产品为示例内容',
  `is_visible` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否在产品页显示',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '产品记录创建时间',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '产品内容维护时间',
  `model` VARCHAR(120) NOT NULL DEFAULT '' COMMENT '产品型号',
  `tags_json` JSON NOT NULL DEFAULT (JSON_ARRAY()) COMMENT '稳定条目标识的展示标签',
  `gallery_json` JSON NOT NULL DEFAULT (JSON_ARRAY()) COMMENT '辅助图片资源列表',
  `icon` VARCHAR(96) NOT NULL DEFAULT 'CircuitBoard' COMMENT '产品图标',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '乐观并发版本',
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '可恢复删除状态',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_products_slug` (`slug`),
  KEY `idx_products_media` (`primary_media_id`),
  KEY `idx_products_category_order` (`category_id`, `is_visible`, `sort_order`, `id`),
  CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `product_categories` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_products_media` FOREIGN KEY (`primary_media_id`) REFERENCES `media_assets` (`id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 管理账户、会话、历史与发布记录同业务数据一起保存在 MySQL。
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` VARCHAR(64) NOT NULL,
  `username` VARCHAR(80) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `must_change_password` BOOLEAN NOT NULL DEFAULT TRUE,
  `session_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `admin_sessions` (
  `session_id` VARCHAR(128) NOT NULL,
  `expires` INT UNSIGNED NOT NULL,
  `data` MEDIUMTEXT NOT NULL,
  PRIMARY KEY (`session_id`),
  KEY `idx_session_expires` (`expires`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `content_revisions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `resource_type` VARCHAR(32) NOT NULL,
  `resource_id` VARCHAR(96) NOT NULL,
  `version` INT UNSIGNED NOT NULL,
  `snapshot_json` JSON NOT NULL,
  `actor_id` VARCHAR(64) NULL,
  `operation_id` VARCHAR(96) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_revision_version` (`resource_type`,`resource_id`,`version`),
  KEY `idx_revision_resource` (`resource_type`,`resource_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_id` VARCHAR(64) NULL,
  `action` VARCHAR(32) NOT NULL,
  `resource_type` VARCHAR(32) NOT NULL,
  `resource_id` VARCHAR(96) NOT NULL,
  `operation_id` VARCHAR(96) NOT NULL,
  `request_id` VARCHAR(96) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_operation` (`operation_id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `media_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `media_id` VARCHAR(96) NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `metadata_json` JSON NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_media_version` (`media_id`,`sha256`),
  CONSTRAINT `fk_version_media` FOREIGN KEY (`media_id`) REFERENCES `media_assets` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `schema_versions` (
  `version` INT UNSIGNED NOT NULL,
  `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 设置只包含已确认的项目署名，以及明确说明为示例的企业占位名称。
INSERT INTO `site_settings` (`setting_key`, `setting_value`) VALUES
  ('project_id', JSON_QUOTE('AEVORIO_SAMPLE_SITE')),
  ('project_name', JSON_QUOTE('AEVORIO')),
  ('author', JSON_QUOTE('NianBroken')),
  ('company_name', JSON_QUOTE('企业名称（示例）')),
  ('language', JSON_QUOTE('zh-CN'));

INSERT INTO `pages` (`slug`, `title`, `meta_description`) VALUES
  ('home', '工程由板开始', '了解企业名称（示例）的硬件研发方向、电路板工程实践与开源思路。'),
  ('products', '硬件产品矩阵', '浏览九类四十五款用于研发探索的原创硬件示例。'),
  ('about', '设计之间', '了解企业名称（示例）的业务组织、设计方法与工程责任。');

-- 页面首屏和工程版面的图像为原创位图，不使用第三方图片地址。
INSERT INTO `media_assets` (`id`, `resource_key`, `file_name`, `relative_path`, `mime_type`, `file_size`, `width`, `height`, `sha256`, `alt_text`) VALUES
  ('media-home-hero', 'home-hero', 'home-hero.png', 'media/home-hero.png', 'image/png', 0, 1920, 1100, REPEAT('0', 64), '浅色背景上的三块原创电路板示意图，显示芯片、走线和不同边缘接口。'),
  ('media-home-engineering', 'home-engineering', 'home-engineering.png', 'media/home-engineering.png', 'image/png', 0, 1500, 920, REPEAT('0', 64), '浅色网点背景上的原创控制板示意图，显示中央芯片、分区器件和线路。'),
  ('media-home-workbench', 'home-workbench', 'home-workbench.png', 'media/home-workbench.png', 'image/png', 0, 1500, 920, REPEAT('0', 64), '原创板卡结构示意图，显示固定孔、接口位置和不同大小的芯片。'),
  ('media-home-testbench', 'home-testbench', 'home-testbench.png', 'media/home-testbench.png', 'image/png', 0, 1500, 920, REPEAT('0', 64), '用于工程验证主题的原创电路板示意图，显示可观察的接口与走线区域。'),
  ('media-about-research', 'about-research', 'about-research.png', 'media/about-research.png', 'image/png', 0, 1500, 920, REPEAT('0', 64), '用于设计方法主题的原创电路板示意图，呈现中央芯片与板边连接布局。'),
  ('media-about-assembly', 'about-assembly', 'about-assembly.png', 'media/about-assembly.png', 'image/png', 0, 1500, 920, REPEAT('0', 64), '用于制作主题的原创绿色电路板示意图，显示芯片排列、固定孔和板边接口。'),
  ('media-about-precision', 'about-precision', 'about-precision.png', 'media/about-precision.png', 'image/png', 0, 1500, 920, REPEAT('0', 64), '用于检查主题的原创电路板示意图，显示芯片、铜色线路和连接位置。');

-- 所有产品图片均使用不同资源标识和文件名，每款示例硬件只关联自身的主图。
INSERT INTO `media_assets` (`id`, `resource_key`, `file_name`, `relative_path`, `mime_type`, `file_size`, `width`, `height`, `sha256`, `alt_text`) VALUES
  ('media-origin-compute', 'product-origin-compute', 'origin-compute.png', 'media/origin-compute.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '原点微型计算板，显示独立计算芯片、低调散热片与边缘接口布局。'),
  ('media-peak-core', 'product-peak-core', 'peak-core.png', 'media/peak-core.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '峰核高性能算力板，显示大面积散热器与多排高速板间连接器。'),
  ('media-refract-main', 'product-refract-main', 'refract-main.png', 'media/refract-main.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '折光多媒体主板，显示多个显示连接口与清晰分区的信号器件。'),
  ('media-weave-gateway', 'product-weave-gateway', 'weave-gateway.png', 'media/weave-gateway.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '织网边缘网关板，显示成对网络插座、处理器与接口指示区域。'),
  ('media-graphite-core', 'product-graphite-core', 'graphite-core.png', 'media/graphite-core.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '石墨低功耗核心板，显示紧凑处理器、细密焊盘与小型板边接口。'),
  ('media-second-control', 'product-second-control', 'second-control.png', 'media/second-control.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '秒针实时控制板，显示中央控制芯片、隔离接口和排针位置。'),
  ('media-southstar-eco', 'product-southstar-eco', 'southstar-eco.png', 'media/southstar-eco.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '南星超低功耗控制器，显示紧凑控制芯片、时钟与状态指示位置。'),
  ('media-arc-touch', 'product-arc-touch', 'arc-touch.png', 'media/arc-touch.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '弧线触控控制板，显示整齐排布的触摸电极和低矮控制芯片。'),
  ('media-quadrant-io', 'product-quadrant-io', 'quadrant-io.png', 'media/quadrant-io.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '象限多路 IO 控制板，显示两排连接器和清晰划分的 I O 分区。'),
  ('media-wutong-learning', 'product-wutong-learning', 'wutong-learning.png', 'media/wutong-learning.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '梧桐教学开发板，显示彩色接口标记、扩展排针和直观的核心区域。'),
  ('media-swallow-radio', 'product-swallow-radio', 'swallow-radio.png', 'media/swallow-radio.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '雨燕双频无线评估板，显示两组射频接口和分隔清楚的无线元件。'),
  ('media-dawn-node', 'product-dawn-node', 'dawn-node.png', 'media/dawn-node.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '晨雾远距通信节点，显示低功耗无线模块、细长天线端口与状态灯。'),
  ('media-prism-front', 'product-prism-front', 'prism-front.png', 'media/prism-front.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '棱线射频前端板，显示分离的射频匹配网络和镀金同轴接口。'),
  ('media-vault-antenna', 'product-vault-antenna', 'vault-antenna.png', 'media/vault-antenna.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '天穹多天线实验板，显示四角天线焊盘和独立信号测试区域。'),
  ('media-spectrum-filter', 'product-spectrum-filter', 'spectrum-filter.png', 'media/spectrum-filter.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '频谱滤波评估板，显示阶梯排列的射频元件和清晰滤波走线。'),
  ('media-ironbridge-485', 'product-ironbridge-485', 'ironbridge-485.png', 'media/ironbridge-485.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '铁桥 RS485 通讯板，显示螺钉端子、隔离芯片与明确的通信指示区。'),
  ('media-blueridge-can', 'product-blueridge-can', 'blueridge-can.png', 'media/blueridge-can.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '蓝廊 CAN 总线接口板，显示双端总线连接器和隔离通信器件。'),
  ('media-cityrail-ethernet', 'product-cityrail-ethernet', 'cityrail-ethernet.png', 'media/cityrail-ethernet.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '城轨以太网交换板，显示多个屏蔽网络插座和居中的交换芯片。'),
  ('media-squareport-poe', 'product-squareport-poe', 'squareport-poe.png', 'media/squareport-poe.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '方港 PoE 接入板，显示网络接口、供电磁性元件和隔离区域。'),
  ('media-dual-protocol-gateway', 'product-dual-protocol-gateway', 'dual-protocol-gateway.png', 'media/dual-protocol-gateway.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '双域工业协议网关，显示分开的有线网络、现场总线和处理器连接。'),
  ('media-stable-buck', 'product-stable-buck', 'stable-buck.png', 'media/stable-buck.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '稳潮同步降压模块，显示电感、输入输出端子与开关电源芯片。'),
  ('media-cell-bms', 'product-cell-bms', 'cell-bms.png', 'media/cell-bms.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '微蓄电池管理板，显示分段电池采样位和配套保护电路。'),
  ('media-sunlight-harvest', 'product-sunlight-harvest', 'sunlight-harvest.png', 'media/sunlight-harvest.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '晨光能量采集板，显示低压采样芯片、大面积输入端子与分立器件。'),
  ('media-lightarc-usbc', 'product-lightarc-usbc', 'lightarc-usbc.png', 'media/lightarc-usbc.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '光弧 USB-C 电源板，显示居中的 Type-C 插座与紧凑功率管理区域。'),
  ('media-isolated-power', 'product-isolated-power', 'isolated-power.png', 'media/isolated-power.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '绝缘隔离供电板，显示安全间隔带、独立变压器区域和接线端子。'),
  ('media-fine-rain-sensor', 'product-fine-rain-sensor', 'fine-rain-sensor.png', 'media/fine-rain-sensor.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '细雨环境采样板，显示空气采样接口和不同密度的传感器封装。'),
  ('media-core-vibration', 'product-core-vibration', 'core-vibration.png', 'media/core-vibration.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '岩心振动监测板，显示居中的惯性传感器和稳固的四角固定孔。'),
  ('media-morningstar-imu', 'product-morningstar-imu', 'morningstar-imu.png', 'media/morningstar-imu.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '启明星惯导融合板，显示三轴测量器件和紧密排列的本地转换电路。'),
  ('media-glass-optical', 'product-glass-optical', 'glass-optical.png', 'media/glass-optical.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '琉璃光学测量板，显示镜头接口、环形定位结构与分隔清楚的光学测量区域。'),
  ('media-celadon-acquisition', 'product-celadon-acquisition', 'celadon-acquisition.png', 'media/celadon-acquisition.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '青瓷高精度采集板，显示隔开的模拟输入区和多组测量连接端。'),
  ('media-master-stepper', 'product-master-stepper', 'master-stepper.png', 'media/master-stepper.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '绳墨步进电机驱动板，显示双路功率开关、散热连接区与输出端子。'),
  ('media-leiger-servo', 'product-leiger-servo', 'leiger-servo.png', 'media/leiger-servo.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '雷格伺服控制板，显示较宽功率区域、独立编码器接口及执行端接线。'),
  ('media-bluebird-robot', 'product-bluebird-robot', 'bluebird-robot.png', 'media/bluebird-robot.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '青鸟机器人底盘板，显示沿外缘布置的驱动接口和中心处理区。'),
  ('media-streamline-axis', 'product-streamline-axis', 'streamline-axis.png', 'media/streamline-axis.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '流线多轴运动控制板，显示多个排列整齐的步进驱动模块位置。'),
  ('media-halfmoon-actuator', 'product-halfmoon-actuator', 'halfmoon-actuator.png', 'media/halfmoon-actuator.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '半月电磁执行板，显示隔离开关管、连接器与独立线圈驱动回路。'),
  ('media-silverwing-backplane', 'product-silverwing-backplane', 'silverwing-backplane.png', 'media/silverwing-backplane.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '银翼高速扩展背板，显示宽阔的连接器阵列与连续信号边缘。'),
  ('media-fluorescent-bridge', 'product-fluorescent-bridge', 'fluorescent-bridge.png', 'media/fluorescent-bridge.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '荧光显示桥接板，显示不同规格的显示接口和中继逻辑芯片。'),
  ('media-stream-audio', 'product-stream-audio', 'stream-audio.png', 'media/stream-audio.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '流音音频处理板，显示音频转换芯片、滤波元件与成对接插口。'),
  ('media-lens-vision', 'product-lens-vision', 'lens-vision.png', 'media/lens-vision.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '透镜视觉接口板，显示宽扁相机插座及周围的高速信号器件。'),
  ('media-beacon-usb', 'product-beacon-usb', 'beacon-usb.png', 'media/beacon-usb.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '信标 USB 多端口板，显示多个垂直接口与整齐分布的供电电路。'),
  ('media-folded-fpga', 'product-folded-fpga', 'folded-fpga.png', 'media/folded-fpga.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '折页 FPGA 原型板，显示大尺寸中央可编程逻辑器件与周围扩展排针。'),
  ('media-iron-guard', 'product-iron-guard', 'iron-guard.png', 'media/iron-guard.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '铁卫可信计算评估板，显示防护型安全器件和分离的调试接口。'),
  ('media-warp-geospatial', 'product-warp-geospatial', 'warp-geospatial.png', 'media/warp-geospatial.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '经纬卫星定位实验板，显示 GNSS 射频接口、屏蔽罩和天线焊接点。'),
  ('media-echo-haptics', 'product-echo-haptics', 'echo-haptics.png', 'media/echo-haptics.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '回响触觉反馈板，显示多路执行器驱动桥、电源区域及震动测试接口。'),
  ('media-master-gauge-fixture', 'product-master-gauge-fixture', 'master-gauge-fixture.png', 'media/master-gauge-fixture.png', 'image/png', 0, 920, 680, REPEAT('0', 64), '匠尺自动化测试治具板，显示密集测试焊盘、带编号的接口和固定孔。');

INSERT INTO `product_categories` (`id`, `slug`, `name`, `description`, `sort_order`) VALUES
  ('category-compute', 'compute', '单板计算与边缘计算', '从紧凑算力板到边缘接入原型，观察计算资源与外设之间的布局关系。', 1),
  ('category-control', 'control', '微控制器与嵌入式控制', '用于实时控制、低功耗交互和外围连接的可比较原型。', 2),
  ('category-wireless', 'wireless', '无线通信与射频', '服务合法研发、授权频段评估及通信链路调试的实验硬件。', 3),
  ('category-network', 'network', '工业网络与通信接口', '用于接口隔离、设备互联和协议转换研究的板级方案。', 4),
  ('category-power', 'power', '电源管理与能量系统', '通过不同的转换、电池保护与安全隔离结构呈现电源管理思路。', 5),
  ('category-sensing', 'sensing', '传感器与数据采集', '面向环境、运动与模拟量测量的多种传感电路结构。', 6),
  ('category-motion', 'motion', '运动控制与自动化', '连接电机、执行机构和自动化样机的控制及功率硬件。', 7),
  ('category-expansion', 'expansion', '接口与功能扩展', '以明确的板间接口、电源连接和信号转换扩充主控功能。', 8),
  ('category-lab', 'lab', '专业实验与特殊硬件', '用于可编程逻辑、安全评估及产品验证的技术演示原型。', 9);

INSERT INTO `products` (`id`, `slug`, `category_id`, `name`, `subtitle`, `description`, `primary_media_id`, `specifications_json`, `features_json`, `sort_order`) VALUES
  ('product-origin-compute', 'origin-compute', 'category-compute', '原点微型计算板', '紧凑型嵌入式计算原型', '小尺寸核心电路与丰富板边连接相结合，便于搭建低占板空间的计算样机。', 'media-origin-compute', JSON_ARRAY('紧凑算力核心', '多类扩展接口'), JSON_ARRAY('适合嵌入式计算验证', '留有结构装配空间'), 1),
  ('product-peak-core', 'peak-core', 'category-compute', '峰核高性能算力板', '兼顾算力与散热布局', '以较宽布局承载计算单元和散热结构，为高负载原型预留工程设计余量。', 'media-peak-core', JSON_ARRAY('高密度计算区', '可扩展散热结构'), JSON_ARRAY('强调热管理空间', '支持高速扩展研究'), 2),
  ('product-refract-main', 'refract-main', 'category-compute', '折光多媒体主板', '多媒体接口桥接平台', '把多路显示和控制信号集中到同一板面，便于探索多媒体处理方案。', 'media-refract-main', JSON_ARRAY('多路显示连接', '独立信号处理区'), JSON_ARRAY('适合人机界面原型', '接口类型清晰可辨'), 3),
  ('product-weave-gateway', 'weave-gateway', 'category-compute', '织网边缘网关板', '网络接入与边缘处理', '组合本地计算与有线接入模块，面向设备边缘联网原型研究。', 'media-weave-gateway', JSON_ARRAY('多个网络接口', '本地数据处理区'), JSON_ARRAY('便于多设备联测', '隔离接口布局明确'), 4),
  ('product-graphite-core', 'graphite-core', 'category-compute', '石墨低功耗核心板', '精简尺寸的核心模块', '减少板上非必要器件，重点展示低功耗核心与主机接口的布局关系。', 'media-graphite-core', JSON_ARRAY('低功耗控制中心', '微型接口设计'), JSON_ARRAY('用于长期运行研究', '适合受限空间集成'), 5),
  ('product-second-control', 'second-control', 'category-control', '秒针实时控制板', '清晰的实时信号控制区', '分离核心控制与外设接线，适合建立易于观测的实时硬件原型。', 'media-second-control', JSON_ARRAY('专用微控制器', '多组信号接口'), JSON_ARRAY('控制路径直观', '具备隔离扩展位置'), 1),
  ('product-southstar-eco', 'southstar-eco', 'category-control', '南星超低功耗控制器', '重视静态功耗的控制原型', '针对待机运行场景安排核心芯片、时钟与传感器的互连位置。', 'media-southstar-eco', JSON_ARRAY('低功耗核心区', '独立时钟位置'), JSON_ARRAY('适合电池设备研究', '保留低功耗测量空间'), 2),
  ('product-arc-touch', 'arc-touch', 'category-control', '弧线触控控制板', '触控电极与核心的协同布局', '通过分开的触控电极与控制区域，呈现适用于面板交互研究的板型。', 'media-arc-touch', JSON_ARRAY('多区触控电极', '紧凑控制单元'), JSON_ARRAY('触控感知区域明确', '适配设备面板打样'), 3),
  ('product-quadrant-io', 'quadrant-io', 'category-control', '象限多路 IO 控制板', '便于观察的外围控制区域', '将多个输入输出接线按区域分布，方便台架验证与接线维护。', 'media-quadrant-io', JSON_ARRAY('两侧扩展连接', '清晰的 IO 分区'), JSON_ARRAY('适合模块联调', '板边连接容易辨认'), 4),
  ('product-wutong-learning', 'wutong-learning', 'category-control', '梧桐教学开发板', '面向学习与实验入门', '通过易辨认的接口和分区明确的元件，帮助学习者理解基础嵌入式连接。', 'media-wutong-learning', JSON_ARRAY('易读的板级布局', '丰富的教学连接点'), JSON_ARRAY('适合学习和课程实验', '便于观察接口关系'), 5),
  ('product-swallow-radio', 'swallow-radio', 'category-wireless', '雨燕双频无线评估板', '用于授权频段链路评估', '双链路射频电路和屏蔽隔离区域便于开展合规无线通信测量。', 'media-swallow-radio', JSON_ARRAY('双射频路径', '可测量匹配网络'), JSON_ARRAY('用于授权实验室研发', '射频边界容易观察'), 1),
  ('product-dawn-node', 'dawn-node', 'category-wireless', '晨雾远距通信节点', '低带宽远距离数据传输', '将低速无线传输与传感节点相连接，适合合法远距通信研究。', 'media-dawn-node', JSON_ARRAY('低速无线连接', '适配低功耗节点'), JSON_ARRAY('定位为合规研发评估', '带有天线接口空间'), 2),
  ('product-prism-front', 'prism-front', 'category-wireless', '棱线射频前端板', '射频链路结构评估', '将匹配、放大及屏蔽位置清晰分区，便于工程师观察射频前端。', 'media-prism-front', JSON_ARRAY('独立前端区域', '射频同轴接口'), JSON_ARRAY('支持授权链路测量', '元件分区清楚'), 3),
  ('product-vault-antenna', 'vault-antenna', 'category-wireless', '天穹多天线实验板', '多天线端口布局实验', '多种天线连接位及测试焊盘便于比较合法无线系统的接口布局。', 'media-vault-antenna', JSON_ARRAY('多个天线接口', '信号评估焊盘'), JSON_ARRAY('用于多路测量研究', '具有明确的天线位置'), 4),
  ('product-spectrum-filter', 'spectrum-filter', 'category-wireless', '频谱滤波评估板', '信号调理结构验证', '利用分立滤波元件组成可读的射频链路，用于授权频谱内的系统开发。', 'media-spectrum-filter', JSON_ARRAY('分离式滤波网络', '测量端口清晰'), JSON_ARRAY('面向合规频谱评估', '方便定位信号路径'), 5),
  ('product-ironbridge-485', 'ironbridge-485', 'category-network', '铁桥 RS485 通讯板', '稳健的串行总线接口', '结合差分通信、隔离布局和螺钉接线，便于可靠地接入有线设备。', 'media-ironbridge-485', JSON_ARRAY('RS485 收发区域', '螺钉接线端子'), JSON_ARRAY('适配工业现场原型', '隔离设计空间明确'), 1),
  ('product-blueridge-can', 'blueridge-can', 'category-network', '蓝廊 CAN 总线接口板', '总线节点互联评估', '收发器与差分线接口分区有序，用于自动化控制的有线联接研究。', 'media-blueridge-can', JSON_ARRAY('CAN 总线接口', '带保护空间'), JSON_ARRAY('支持多节点联测', '带有通信隔离布局'), 2),
  ('product-cityrail-ethernet', 'cityrail-ethernet', 'category-network', '城轨以太网交换板', '多端口网络设备互联', '围绕交换核心布置多路屏蔽网络接口，适合构建受控设备互联样机。', 'media-cityrail-ethernet', JSON_ARRAY('多路以太网连接', '中心交换处理芯片'), JSON_ARRAY('便于观察设备拓扑', '端口分布清晰'), 3),
  ('product-squareport-poe', 'squareport-poe', 'category-network', '方港 PoE 接入板', '有线通信与设备供电', '使用独立供电与网络信号区域，展示接入设备的电源协同思路。', 'media-squareport-poe', JSON_ARRAY('PoE 供电区域', '有线设备接口'), JSON_ARRAY('利于供电结构研究', '高低压区域相对分离'), 4),
  ('product-dual-protocol-gateway', 'dual-protocol-gateway', 'category-network', '双域工业协议网关', '不同有线系统之间互联', '把现场总线与以太网连接汇聚到网关核心，方便搭建工业设备协议转换。', 'media-dual-protocol-gateway', JSON_ARRAY('双类通信接口', '集中网关逻辑区'), JSON_ARRAY('适配控制网络联接研究', '接口方向直观'), 5),
  ('product-stable-buck', 'stable-buck', 'category-power', '稳潮同步降压模块', '紧凑的降压转换电路', '集中展示同步降压器件、电感与负载连接，便于电源设计验证。', 'media-stable-buck', JSON_ARRAY('同步降压拓扑', '大电流路径空间'), JSON_ARRAY('功率区域容易识别', '适合模块级验证'), 1),
  ('product-cell-bms', 'cell-bms', 'category-power', '微蓄电池管理板', '电池状态与保护样机', '将电芯采样与保护器件分区排列，为电池组管理硬件研发提供参考。', 'media-cell-bms', JSON_ARRAY('电芯采样端', '电池保护电路'), JSON_ARRAY('用于电池状态研究', '采样接线易辨认'), 2),
  ('product-sunlight-harvest', 'sunlight-harvest', 'category-power', '晨光能量采集板', '面向微功率能源研究', '以低压采集和能量转换为核心，适配自主供电传感节点的技术评估。', 'media-sunlight-harvest', JSON_ARRAY('微功率电源输入', '独立能量采集区域'), JSON_ARRAY('适合低功率研究', '具备输入测量焊盘'), 3),
  ('product-lightarc-usbc', 'lightarc-usbc', 'category-power', '光弧 USB-C 电源板', '小尺寸通用供电设计', '将 USB-C 接入保护和功率处理集中安排，方便复用通用电源接口。', 'media-lightarc-usbc', JSON_ARRAY('USB-C 供电接口', '电源管理芯片'), JSON_ARRAY('接入口可直接识别', '紧凑转换布局'), 4),
  ('product-isolated-power', 'isolated-power', 'category-power', '绝缘隔离供电板', '电气分区明显的供电结构', '以独立输入输出和清晰安全间距呈现隔离式供电研发设计。', 'media-isolated-power', JSON_ARRAY('输入输出安全隔离', '独立电源模块'), JSON_ARRAY('供电分区清楚', '预留隔离测试点'), 5),
  ('product-fine-rain-sensor', 'fine-rain-sensor', 'category-sensing', '细雨环境采样板', '多元环境信号整合', '组合空气环境采样接口和信号处理区，适合联网环境监测原型。', 'media-fine-rain-sensor', JSON_ARRAY('多类传感器连接', '信号调理区域'), JSON_ARRAY('便于扩展环境采集', '元件种类易于区分'), 1),
  ('product-core-vibration', 'core-vibration', 'category-sensing', '岩心振动监测板', '面向设备振动状态研究', '将惯性采样芯片布置于具有固定孔的紧凑板型中央。', 'media-core-vibration', JSON_ARRAY('惯性传感接口', '四角安装孔'), JSON_ARRAY('便于机械结构固定', '适合振动信号采集'), 2),
  ('product-morningstar-imu', 'morningstar-imu', 'category-sensing', '启明星惯导融合板', '姿态与运动信号测量', '将惯性传感和本地处理组件分区布局，适合嵌入式运动测量验证。', 'media-morningstar-imu', JSON_ARRAY('多轴运动测量', '本地数据处理区'), JSON_ARRAY('信号路径清晰', '适合小型设备集成'), 3),
  ('product-glass-optical', 'glass-optical', 'category-sensing', '琉璃光学测量板', '光线感知实验接口', '从板面中央的光学组件延伸到外围光信号处理电路，适配视觉测量原型。', 'media-glass-optical', JSON_ARRAY('中心光学连接位', '独立模拟采样区'), JSON_ARRAY('适于比较传感器布局', '检测组件方向直观'), 4),
  ('product-celadon-acquisition', 'celadon-acquisition', 'category-sensing', '青瓷高精度采集板', '关注模拟信号测量', '隔离模拟输入和数字接口，为不同采集通道保留充分的焊接位置。', 'media-celadon-acquisition', JSON_ARRAY('多路模拟信号输入', '独立采样处理核心'), JSON_ARRAY('强调采集分区', '方便逐通道验证'), 5),
  ('product-master-stepper', 'master-stepper', 'category-motion', '绳墨步进电机驱动板', '双路步进驱动布局', '在紧凑板面内分离多路功率驱动与控制信号接线。', 'media-master-stepper', JSON_ARRAY('双路电机驱动位', '大间距功率接线'), JSON_ARRAY('布局便于识别', '适合自动化样机'), 1),
  ('product-leiger-servo', 'leiger-servo', 'category-motion', '雷格伺服控制板', '电机与编码器信号联接', '将功率输出和反馈接口安排在相对独立的区域，方便伺服控制验证。', 'media-leiger-servo', JSON_ARRAY('伺服输出接口', '编码器反馈位置'), JSON_ARRAY('功率与控制区域分离', '利于台架调试'), 2),
  ('product-bluebird-robot', 'bluebird-robot', 'category-motion', '青鸟机器人底盘板', '机器人底盘设备互联', '将电机、距离传感器及控制系统接口引向板边，适合移动机器人样机。', 'media-bluebird-robot', JSON_ARRAY('分区外设接口', '中央机器人控制位'), JSON_ARRAY('连接逻辑容易查看', '适合小型设备原型'), 3),
  ('product-streamline-axis', 'streamline-axis', 'category-motion', '流线多轴运动控制板', '多轴协同运动电路', '通过成排独立驱动位置，体现多个运动控制通道在板上的组织方式。', 'media-streamline-axis', JSON_ARRAY('多通道驱动接口', '一致的轴向排布'), JSON_ARRAY('适用于多轴联调', '功率回路边界清楚'), 4),
  ('product-halfmoon-actuator', 'halfmoon-actuator', 'category-motion', '半月电磁执行板', '线圈负载的状态控制', '将执行机构功率控制和保护区域隔离，便于观察电磁负载接口。', 'media-halfmoon-actuator', JSON_ARRAY('多路执行输出', '独立保护电路'), JSON_ARRAY('适合电磁元件驱动', '功率端子易于辨认'), 5),
  ('product-silverwing-backplane', 'silverwing-backplane', 'category-expansion', '银翼高速扩展背板', '密集板间信号传递', '以较宽的成组连接器和清晰边缘布局扩展上层模块的连接能力。', 'media-silverwing-backplane', JSON_ARRAY('大尺寸板间连接', '密集高速信号分区'), JSON_ARRAY('适配模块化原型', '展示高速连接布局'), 1),
  ('product-fluorescent-bridge', 'fluorescent-bridge', 'category-expansion', '荧光显示桥接板', '显示设备间的接口转换', '将常见显示连接器与信号桥接电路集中布置，简化原型设备联接。', 'media-fluorescent-bridge', JSON_ARRAY('多类型显示接口', '信号中继器件区'), JSON_ARRAY('用途明确的连接转换', '接插件位置显眼'), 2),
  ('product-stream-audio', 'stream-audio', 'category-expansion', '流音音频处理板', '声音采样与信号输出', '将音频输入输出和滤波处理组成清楚的独立信号链。', 'media-stream-audio', JSON_ARRAY('音频采样接口', '滤波与转换区域'), JSON_ARRAY('两侧音频连接可辨', '适配声音采集原型'), 3),
  ('product-lens-vision', 'lens-vision', 'category-expansion', '透镜视觉接口板', '相机数据的高速转接', '采用醒目的宽带相机连接器与紧凑的信号处理区域，适配机器视觉设备开发。', 'media-lens-vision', JSON_ARRAY('宽扁相机连接器', '高速数据处理位置'), JSON_ARRAY('适用于相机集成研发', '连接器与主板分离'), 4),
  ('product-beacon-usb', 'beacon-usb', 'category-expansion', '信标 USB 多端口板', '通用外设接口扩展', '多个垂直接口与共同供电管理构成实用外设连接扩展模块。', 'media-beacon-usb', JSON_ARRAY('多枚 USB 插座', '独立供电管理'), JSON_ARRAY('展示实际接口数量', '利于外设联接验证'), 5),
  ('product-folded-fpga', 'folded-fpga', 'category-lab', '折页 FPGA 原型板', '可编程逻辑硬件实验', '以中央可编程逻辑器件为主体，板面周围布置时钟、扩展与调试接口。', 'media-folded-fpga', JSON_ARRAY('核心逻辑处理器件', '多组边缘扩展排针'), JSON_ARRAY('适合可编程逻辑研究', '模块位置对称排列'), 1),
  ('product-iron-guard', 'iron-guard', 'category-lab', '铁卫可信计算评估板', '可信硬件接口研究', '以独立安全芯片和受控调试接点为中心，服务可信计算方案的实验评估。', 'media-iron-guard', JSON_ARRAY('独立安全计算核心', '分离式调试接口'), JSON_ARRAY('适用于合规安全研发', '评估结构容易辨认'), 2),
  ('product-warp-geospatial', 'warp-geospatial', 'category-lab', '经纬卫星定位实验板', '定位信号接收原型', '组合卫星定位射频输入、遮蔽罩和嵌入式采样逻辑，构造有源定位实验原型。', 'media-warp-geospatial', JSON_ARRAY('卫星定位射频接口', '本地定位解码位置'), JSON_ARRAY('用于授权的定位测试', '带有信号屏蔽区域'), 3),
  ('product-echo-haptics', 'echo-haptics', 'category-lab', '回响触觉反馈板', '振感信号的采集与驱动', '将触觉采样信号和多路执行驱动组合，便于研究电子交互与振感响应。', 'media-echo-haptics', JSON_ARRAY('多路触觉驱动器', '反馈采样接口'), JSON_ARRAY('支持交互硬件研究', '输入输出区域分明'), 4),
  ('product-master-gauge-fixture', 'master-gauge-fixture', 'category-lab', '匠尺自动化测试治具板', '板级接口功能验证', '不同功能测试点与外设座子排布在同一定位板面，用于产品验证夹具的硬件开发。', 'media-master-gauge-fixture', JSON_ARRAY('密集功能测试焊盘', '工装安装位置'), JSON_ARRAY('便于重复测试与连接', '突出夹具验证接口'), 5);

INSERT INTO `page_sections` (`page_id`, `section_key`, `section_type`, `title`, `subtitle`, `description`, `content_json`, `media_id`, `sort_order`) VALUES
  ((SELECT id FROM pages WHERE slug = 'home'), 'H01-hero', 'hero', '把想法，做成可验证的硬件', '工程从一块电路板开始', '企业名称（示例）关注 PCB 研发制作、嵌入式硬件和开源技术实践。页面中的产品均为结构演示示例。', JSON_OBJECT('eyebrow', 'HARDWARE / ENGINEERING', 'note', '项目演示内容，不代表实际销售产品'), 'media-home-hero', 1),
  ((SELECT id FROM pages WHERE slug = 'home'), 'H02-practice', 'editorial', '从电路设计开始理解一件硬件', '研发、制作与共享彼此连贯', '在需求、线路结构、板级原型与可阅读的技术资料之间建立清晰关系。', JSON_OBJECT('points', JSON_ARRAY('PCB 研发与方案整理', '电子硬件的制作探索', '技术内容记录与分享')), 'media-home-engineering', 2),
  ((SELECT id FROM pages WHERE slug = 'home'), 'H03-shapes', 'board-showcase', '让不同的板型找到自己的空间', '形态、接口与用途并不相同', '计算核心适合集中算力，传感板着重测量位置，接入模块则需要直观的有线接口。', JSON_OBJECT('points', JSON_ARRAY('紧凑核心板', '隔离通信板', '采样扩展板', '控制功率板')), 'media-home-workbench', 3),
  ((SELECT id FROM pages WHERE slug = 'home'), 'H04-prototype', 'workflow', '先理解问题，再验证电路', '需求整理 / 设计推演 / 原型检查', '把实际使用场景转成可以检验的硬件要求。方案讨论、连接规划和原型试验彼此配合，帮助发现设计中的实际限制。', JSON_OBJECT('steps', JSON_ARRAY('澄清需求', '梳理信号', '布局电路', '搭建验证')), NULL, 4),
  ((SELECT id FROM pages WHERE slug = 'home'), 'H05-layers', 'engineering', '看一条线路怎样组织', '分区、回流与连接都能被检查', '不同信号和供电区域需要合理安排。布局思路应结合材料叠层、连接需求和电路验证结果一起评估。', JSON_OBJECT('points', JSON_ARRAY('电路功能分区', '焊盘与连接结构', '布局与走线观察')), 'media-home-engineering', 5),
  ((SELECT id FROM pages WHERE slug = 'home'), 'H06-making', 'craft', '制作经验来自可复用的细节', '选择元件之后，还要考虑装配方式', '焊接空间、机械固定和器件摆放会影响样机装配。以清楚的工程信息支持打样、制作和后续维护。', JSON_OBJECT('points', JSON_ARRAY('板材与工艺选择', '器件装配位置', '清楚的连接说明')), 'media-about-assembly', 6),
  ((SELECT id FROM pages WHERE slug = 'home'), 'H07-validation', 'validation', '验证先于未经证实的结论', '记录现象，定位问题，保留依据', '以连接检查、基本功能验证和测试记录改进具体硬件设计，不以未经核验的认证、指标或测试成绩作宣传。', JSON_OBJECT('points', JSON_ARRAY('检查接口方向', '观察供电与状态', '记录真实测试过程')), 'media-home-testbench', 7),
  ((SELECT id FROM pages WHERE slug = 'home'), 'H08-open', 'principles', '开放设计让学习过程更清楚', '让线路、接口与使用资料容易理解', '可读的设计说明有利于学习、复查和技术交流。具体项目的源文件、发布方式和开源许可须以真实确认的信息为准。', JSON_OBJECT('points', JSON_ARRAY('阅读工程资料', '交换实践经验', '积累学习笔记')), 'media-about-research', 8),
  ((SELECT id FROM pages WHERE slug = 'home'), 'H09-application', 'applications', '从实验桌到设备边缘', '聚焦合法开发、设备验证与教学实践', '板级硬件能够支撑嵌入式实验、自动化设备互联、边缘计算研究以及面向课程的测量和演示。', JSON_OBJECT('points', JSON_ARRAY('嵌入式学习', '通信研发', '设备自动化', '课程实验')), NULL, 9),
  ((SELECT id FROM pages WHERE slug = 'home'), 'H10-collaboration', 'collaboration', '合作始于把工程问题讲清', '可讨论的样机方向示例', '需求梳理、原型意见和后续验证均为通用项目协作示例，不构成企业对外服务范围或商业交付承诺。', JSON_OBJECT('points', JSON_ARRAY('沟通需求', '讨论板级方案', '共同梳理验证问题'), 'status', '可编辑示例，不代表实际服务承诺'), NULL, 10),
  ((SELECT id FROM pages WHERE slug = 'home'), 'H11-principles', 'quote', '把连接关系做清楚，工程就更容易被继续', '好设计同时关照使用、验证与后期维护。', '硬件的价值不仅在于电路接通，还在于设计是否易于检查，结构是否支持后续制作，相关内容是否能够被真实理解。', JSON_OBJECT('note', '工程理念示例'), 'media-about-precision', 11),
  ((SELECT id FROM pages WHERE slug = 'home'), 'H12-next', 'closing', '继续了解板卡和工程方法', '从产品矩阵观察不同电路设计', '查看独立的产品图像与类别说明，或进一步了解企业业务内容的示例组织方式。', JSON_OBJECT('links', JSON_ARRAY('products', 'about')), NULL, 12),

  ((SELECT id FROM pages WHERE slug = 'products'), 'P01-hero', 'hero', '为不同的工程问题，留出不同的板型', '九类板卡 / 四十五款原创结构示例', '每款产品图分别呈现芯片位置、接口数量、供电方式或板形变化。它们是技术演示素材，并非已量产或正式销售商品。', JSON_OBJECT('eyebrow', 'AN ORIGINAL HARDWARE INDEX', 'note', '全部名称与板卡仅用于示例展示'), 'media-home-engineering', 1),
  ((SELECT id FROM pages WHERE slug = 'products'), 'P02-categories', 'category-overview', '先从用途区分电路方向', '每个分类都围绕不同的硬件任务组织', '按计算、控制、通信、接口和实验等实际设计用途分组。通过类别快速跳转到当前产品页内的对应板卡。', JSON_OBJECT('source', 'product_categories'), NULL, 2),
  ((SELECT id FROM pages WHERE slug = 'products'), 'P03-compute', 'product-matrix', '单板计算与边缘计算', '五种算力与设备接入布局', '从紧凑核心模组到多端口网关，比较处理区域、散热空间和接线方式。', JSON_OBJECT('category', 'compute'), NULL, 3),
  ((SELECT id FROM pages WHERE slug = 'products'), 'P04-control', 'product-matrix', '微控制器与嵌入式控制', '为接口、时序和设备交互安排电路', '包含低功耗控制、实时信号、触控输入和教学扩展等板级构想。', JSON_OBJECT('category', 'control'), NULL, 4),
  ((SELECT id FROM pages WHERE slug = 'products'), 'P05-wireless', 'product-matrix', '无线通信与射频', '面向合规研发与授权测试', '各款演示板以不同射频端口、滤波元件和天线位置体现通信电路差异。', JSON_OBJECT('category', 'wireless', 'note', '演示仅适用于合法研发及授权测试。'), NULL, 5),
  ((SELECT id FROM pages WHERE slug = 'products'), 'P06-network', 'product-matrix', '工业网络与通信接口', '接口方向与隔离空间清楚可读', '串行通信、现场总线、以太网和协议转换板呈现不同有线互联布局。', JSON_OBJECT('category', 'network'), NULL, 6),
  ((SELECT id FROM pages WHERE slug = 'products'), 'P07-power', 'product-matrix', '电源管理与能量系统', '关注供电、转换和安全边界', '不同板卡分别强调降压、设备电池、能量采集和隔离区域的结构。', JSON_OBJECT('category', 'power'), NULL, 7),
  ((SELECT id FROM pages WHERE slug = 'products'), 'P08-sensing', 'product-matrix', '传感器与数据采集', '让被测对象与信号链对应', '涵盖环境、振动、惯导、光学和模拟采样不同传感电路布局。', JSON_OBJECT('category', 'sensing'), NULL, 8),
  ((SELECT id FROM pages WHERE slug = 'products'), 'P09-motion', 'product-matrix', '运动控制与自动化', '把功率输出与位置反馈分区', '从电机驱动到机器人底盘，板型展示适合不同自动化任务的连接形态。', JSON_OBJECT('category', 'motion'), NULL, 9),
  ((SELECT id FROM pages WHERE slug = 'products'), 'P10-expansion', 'product-matrix', '接口与功能扩展', '显示、声音、视觉与通用接入', '桥接板依据需要使用差异明显的高速连接器、采集接口或外设扩展区。', JSON_OBJECT('category', 'expansion'), NULL, 10),
  ((SELECT id FROM pages WHERE slug = 'products'), 'P11-lab', 'product-matrix', '专业实验与特殊硬件', '用板卡呈现观察和验证方式', '通过可编程逻辑、合规安全评估、定位与测量治具探索工程设计空间。', JSON_OBJECT('category', 'lab'), NULL, 11),
  ((SELECT id FROM pages WHERE slug = 'products'), 'P12-selection', 'selection-guide', '先看接口，再核对功率与空间', '为实际设备筛选提供可观察的出发点', '核对板卡能够接入的接口、输入输出电压和预留机械空间。需要无线研发时，提前确认实际使用环境与测试授权。', JSON_OBJECT('points', JSON_ARRAY('接口类型与数量', '供电方式和使用功率', '设备尺寸与安装位置', '后续调试方式')), NULL, 12),
  ((SELECT id FROM pages WHERE slug = 'products'), 'P13-end', 'closing', '板卡背后的方法也值得了解', '走进公司介绍，继续了解设计思路', '技术样例只有结合真实需求、实际约束和验证过程，才能成为可靠工程的一部分。', JSON_OBJECT('links', JSON_ARRAY('about', 'home')), NULL, 13),

  ((SELECT id FROM pages WHERE slug = 'about'), 'A01-story', 'hero', '一块板，连接设计与实际应用', '硬件工程需要能够读懂和检验的细节', '企业名称（示例）是一家介绍电路板研发制作、嵌入式硬件设计探索和开源实践的示例企业名称，不是已经核实的现实主体。', JSON_OBJECT('eyebrow', 'DESIGN / CIRCUITS / SHARED KNOWLEDGE'), 'media-about-research', 1),
  ((SELECT id FROM pages WHERE slug = 'about'), 'A02-intro', 'editorial', '把硬件开发这件事说清楚', '先展示业务性质，而不是虚构企业历史', '业务方向覆盖 PCB 电路板的设计与制作、嵌入式控制原型以及硬件方案的技术验证，内容面对工程开发者和对电子产品感兴趣的访客。', JSON_OBJECT('points', JSON_ARRAY('板级电路设计探索', '硬件原型研发', '相关技术文档整理')), NULL, 2),
  ((SELECT id FROM pages WHERE slug = 'about'), 'A03-stages', 'timeline', '从理解问题到持续改进', '以业务阶段说明典型研发逻辑', '下列阶段描述硬件项目的一般工作方式，不虚构具体年份、企业成立时间、真实事件或客户合作。', JSON_OBJECT('steps', JSON_ARRAY('探索：了解真实使用条件', '原型：搭建第一版验证线路', '评估：记录测试现象与限制', '迭代：依据问题检查设计')), NULL, 3),
  ((SELECT id FROM pages WHERE slug = 'about'), 'A04-business', 'capabilities', '四类工作相互配合', '研发、电路板制作、系统联接与知识记录', '电路分析、布局安排、板级实现和设计说明彼此关联。把它们分开讨论，有助于明确每个阶段需要解决的问题。', JSON_OBJECT('points', JSON_ARRAY('需求与电路规划', 'PCB 设计与制作探索', '嵌入式系统连接', '技术资料整理')), NULL, 4),
  ((SELECT id FROM pages WHERE slug = 'about'), 'A05-method', 'editorial', '设计决策从使用场景出发', '先明确电路要连接的实际对象', '工程分析从输入输出、信号类型和工作环境入手，再逐步安排器件、线路和接口。按步骤检查约束，降低凭空堆砌规格的风险。', JSON_OBJECT('points', JSON_ARRAY('确认应用场景', '整理信号关系', '复核接口边界')), 'media-home-engineering', 5),
  ((SELECT id FROM pages WHERE slug = 'about'), 'A06-functions', 'disciplines', '不同专业关注同一块板的不同部分', '硬件设计、嵌入式、测试、制作与文档', '将不同技术职能的工作目标说清楚，便于共享设计输入和记录问题。这里描述职能协同方式，不虚构具体员工身份和人数。', JSON_OBJECT('points', JSON_ARRAY('电路与 PCB 规划', '固件与系统协同', '验证与测量记录', '装配与技术文档')), NULL, 6),
  ((SELECT id FROM pages WHERE slug = 'about'), 'A07-making', 'craft', '从纸面线路走向实际制作', '器件选择、装配位置与机械接口需要一起考虑', '设计应留出连接、焊接、固定和检查的空间。评估实际可制作性，有助于保持原型与预期电路功能一致。', JSON_OBJECT('points', JSON_ARRAY('考虑焊接和返修', '明确机械固定位置', '评估接线和装配步骤')), 'media-about-assembly', 7),
  ((SELECT id FROM pages WHERE slug = 'about'), 'A08-quality', 'validation', '质量判断需要可以复查的依据', '记录问题和状态，让结论能被再次核验', '针对供电、连接和基本功能进行对应检查。网站不公布未核实的合格率、认证结果和测试性能数据。', JSON_OBJECT('points', JSON_ARRAY('记录测试环境', '描述实际观察结果', '重新验证重要改动')), 'media-about-precision', 8),
  ((SELECT id FROM pages WHERE slug = 'about'), 'A09-sharing', 'principles', '让看得懂的资料帮助知识传递', '可以分享的方法，比未经证实的承诺更有价值', '设计图纸和实用说明能够支持自学与协作。具体仓库、发布进度、许可方式及真实开放承诺应以经确认的项目信息为准。', JSON_OBJECT('points', JSON_ARRAY('整理读得懂的电路说明', '标出使用与限制条件', '记录实际测试和变更')), NULL, 9),
  ((SELECT id FROM pages WHERE slug = 'about'), 'A10-collaborate', 'collaboration', '把需求变成可以共同判断的问题', '先沟通边界，再考虑工程方案', '技术协作通常需要确认应用需求、接口条件、验证方式和维护范围。本板块介绍通用项目思路，不表示已经提供某项具体商业服务。', JSON_OBJECT('steps', JSON_ARRAY('说明需求背景', '澄清硬件接口', '讨论检查方式'), 'status', '工作过程示例'), NULL, 10),
  ((SELECT id FROM pages WHERE slug = 'about'), 'A11-responsibility', 'principles', '让电路更容易检查，也更容易继续维护', '清楚的设计能减少后续使用中的盲区', '关注材料消耗、零部件替换和设计可读性，是增加硬件工程寿命的实际方法。', JSON_OBJECT('points', JSON_ARRAY('减少不必要的复杂度', '保留必要的工程说明', '考虑维修与设备升级')), NULL, 11),
  ((SELECT id FROM pages WHERE slug = 'about'), 'A12-future', 'closing', '未来继续探索可验证的硬件方案', '连接设计、制作与实际使用之间的经验', '以嵌入式计算、通信接口、能量管理和传感技术等方向作为研发关注示例，不构成已经确定的发展承诺。', JSON_OBJECT('links', JSON_ARRAY('products', 'home')), NULL, 12);
