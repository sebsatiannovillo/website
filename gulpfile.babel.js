const pkg = require( './package' );
const format = require( 'string-template' );
const del = require( 'del' );
const path = require( 'path' );
const fs = require( 'fs' );
const browserSync = require( 'browser-sync' );
const named = require( 'vinyl-named' );
const webpack = require( 'webpack-stream' );
const gulp = require( 'gulp' );
const imageminJpegRecompress = require( 'imagemin-jpeg-recompress' );
const imageminPngquant = require( 'imagemin-pngquant' );
const $ = require( 'gulp-load-plugins' )();

const gulpConfig = ( () => {
    // template variable
    function template( variable, vars ) {
        if ( variable !== null && typeof variable === 'object' || Array.isArray( variable ) ) {
            for ( const k in variable ) {
                variable[k] = template( variable[k], vars );
            }
        }
        if ( typeof variable === 'string' ) {
            variable = format( variable, vars );
        }
        return variable;
    }
    return template( pkg.gulp_config, pkg.gulp_config.variables );
} )();

/**
 * Error Handler for gulp-plumber
 */
function errorHandler( err ) {
    console.error( err );
    this.emit( 'end' );
}


/**
 * Clean Task
 */
gulp.task( 'clean', ( cb ) => {
    del( gulpConfig.variables.dist ).then( () => {
        cb();
    } );
} );


/**
 * BrowserSync Task
 */
gulp.task( 'browserSyncTask', () => {
    browserSync.init( gulpConfig.browserSync );
} );


/**
 * HTML Task
 */
gulp.task( 'html', () => {
    // get data for nunjucks templates
    function getData( file ) {
        const data = JSON.parse( fs.readFileSync( gulpConfig.html.dataFile, 'utf8' ) );
        data.file = file;
        data.filename = path.basename( file.path );

        // active menu item for menu
        data.isActiveMenuItem = function ( file, item, filename ) {
            if ( file === filename || ( item.sub && item.sub[filename] ) ) {
                return true;
            }

            if ( item.sub ) {
                for ( const fileSub in item.sub ) {
                    const itemSub = item.sub[fileSub];

                    if ( fileSub === filename || ( itemSub.sub && itemSub.sub[filename] ) ) {
                        return true;
                    }
                }
            }

            return false;
        };

        return data;
    }

    return gulp.src( gulpConfig.html.from )
        .pipe( $.plumber( { errorHandler } ) )
        .pipe( $.data( getData ) )
        .pipe( $.nunjucksRender( {
            path: gulpConfig.html.renderPath,
            envOptions: {
                watch: false,
            },
        } ) )
        .pipe( $.prettify( { indent_size: 4, unformatted: ['pre', 'code'] } ) )
        .pipe( gulp.dest( gulpConfig.html.to ) )
        .on( 'end', () => {
            browserSync.reload();
        } );
} );


/**
 * CSS Task
 */
gulp.task( 'css', () => gulp.src( gulpConfig.css.from )
    .pipe( $.plumber( { errorHandler } ) )
    .pipe( $.sass( gulpConfig.css.sass ) )
    .pipe( $.autoprefixer() )
    .pipe( $.cleanCss() )
    .pipe( $.rename( {
        extname: '.min.css',
    } ) )
    .pipe( gulp.dest( gulpConfig.css.to ) )
    .pipe( browserSync.stream() ) );


/**
 * JS Task
 */
gulp.task( 'js', () => gulp.src( gulpConfig.js.from )
    .pipe( $.plumber( { errorHandler } ) )
    .pipe( named() )
    .pipe( webpack( {
        mode: 'none',
        module: {
            rules: [
                {
                    test: /\.js$/,
                    loader: 'babel-loader',
                },
            ],
        },
    } ) )
    .pipe( $.uglify() )
    .pipe( $.if( ( file ) => !file.path.match( /-init.js$/ ), $.rename( {
        extname: '.min.js',
    } ) ) )
    .pipe( $.sourcemaps.write( '.' ) )
    .pipe( gulp.dest( gulpConfig.js.to ) )
    .pipe( browserSync.stream() ) );


/**
 * Static Task
 */
let staticCount = 0;
function staticTask( cb ) {
    const staticArr = gulpConfig.static;
    if ( staticArr.length && 'undefined' !== typeof staticArr[staticCount] ) {
        gulp.src( staticArr[staticCount].from )
            .pipe( $.changed( staticArr[staticCount].to ) ) // Ignore unchanged files
            .pipe( gulp.dest( staticArr[staticCount].to ) )
            .on( 'end', () => {
                staticCount++;
                staticTask( cb );
            } );
    } else {
        staticCount = 0;
        browserSync.reload();
        cb();
    }
}
gulp.task( 'static', staticTask );


/**
 * Images Task
 */
gulp.task( 'images', () => gulp.src( gulpConfig.images.from )
    .pipe( $.plumber( { errorHandler } ) )
    .pipe( $.changed( gulpConfig.images.to ) ) // Ignore unchanged files
    .pipe( gulp.dest( gulpConfig.images.to ) )
    .pipe( browserSync.stream() ) );


/**
 * Images minified
 */
gulp.task( 'images_min', () => gulp.src( gulpConfig.images.from )
    .pipe( $.imagemin( [
        imageminJpegRecompress( {
            progressive: true,
            max: 90,
            min: 80,
        } ),
        imageminPngquant( { quality: [0.8, 0.9] } ),
    ] ) )
    .pipe( gulp.dest( gulpConfig.images.to ) ) );


/**
 * Default Task
 */
gulp.task( 'default', ( cb ) => {
    gulp.series( 'clean', 'images', 'html', 'css', 'js', 'static', 'watch' )( cb );
} );


/**
 * Production Task
 */
gulp.task( 'production', ( cb ) => {
    process.env.NODE_ENV = process.env.NODE_ENV || 'production';
    gulp.series( 'clean', 'html', 'css', 'js', 'static', 'images_min' )( cb );
} );


/**
 * Watch Task
 */
gulp.task( 'watch', gulp.parallel( 'browserSyncTask', () => {
    gulpConfig.watch.forEach( ( item ) => {
        $.watch( item.from, gulp.series( item.task ) );
    } );
} ) );
