<?
Header('Content-Type: text/html; charset=UTF-8');
setlocale(LC_ALL, 'ru_RU.UTF-8');

include_once ('passwd.php');
include_once ('functions.php');

define("PERSMAP_MAX_POINTS", 30);
define("PERSMAP_MAX_LINES", 20);
define("PERSMAP_MAX_LINE_POINTS", 30);

$pages_menu=array(
array("name"=>"map","text"=>"Карта","color"=>"#99bd1b"),
array("name"=>"cakes","text"=>"Плюшки","color"=>"#f9ba1c"),
array("name"=>"about","text"=>"О проекте","color"=>"#fad051")
);

pg_connect("host='".$pg_host."' user='".$pg_user."' password='".$pg_pass."' dbname='".$pg_base."'") or die(Err500());
//mysql_query('SET CHARACTER SET utf8');
//mysql_query('SET NAMES utf8');
//mysql_select_db($mysql_base);

session_start();
ob_start();
?>
