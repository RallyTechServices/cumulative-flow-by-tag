Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'control_box',layout: {type:'vbox'}},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    portfolioItemTypes: ['PortfolioItem/Feature','PortfolioItem/Initiative','PortfolioItem/Theme'],
    launch: function() {
        Ext.create('CumulativeFlowCalculator',{});
        var min_dropdown_width = 300; 
        var label_width = 100;
        this.down('#control_box').add({
            xtype: 'rallytagpicker',
            itemId: 'tag-picker',
            alwaysExpanded: false,
            minWidth: min_dropdown_width,
            fieldLabel: 'Tags',
            labelWidth: label_width,
            labelAlign: 'right',
            padding: 10
        });
        
//        this.down('#control_box').add({
//            xtype: 'rallyportfolioitemtypecombobox',
//            itemId: 'type-picker',
//            fieldLabel: 'PortfolioItem Type',
//            minWidth: min_dropdown_width,
//            labelWidth: label_width,
//            labelAlign: 'right',
//            padding: 10
//                
//        });
        
        this.down('#control_box').add({
            xtype: 'rallybutton',
            text: 'Run',
            margin: '10 10 10 115',
            scope: this,
            handler: this._createChart
        });
        
    },
    _createChart: function(){
        this.logger.log('_createChart');
        var tags = this._getTagObjectIDs();  
        
        this._getAssociatedPortfolioItems(tags).then({
            scope:this,
            success: function(portfolioItemIds){
                this.down('#display_box').add({
                    xtype: 'rallychart',
                    itemId: 'rally-chart',
                    calculatorType: 'CumulativeFlowCalculator',
                    storeType: 'Rally.data.lookback.SnapshotStore',
                    storeConfig: this._getStoreConfig(portfolioItemIds),
                    calculatorConfig: {
                        stateFieldName: 'ScheduleState',
                        stateFieldValues: ['Defined','In-Progress','Completed','Accepted']
                    },
                    chartConfig: this._getChartConfig()
                });
            },
            failure: function(error, success){
                alert(error);
            }
        });
        

    },
    _getChartConfig: function(){
        return {
            chart: {
                zoomType: 'xy'
            },
            title: {
                text: 'Cumulative Flow by Tags'
            },
            xAxis: {
                tickmarkPlacement: 'on',
                tickInterval: 7,
            },
            yAxis: [
                {
                    title: {
                        text: 'Points'
                    }
                }
            ],
            plotOptions: {
                series: {
                    marker: { enabled: false },
                    stacking: 'normal'
                },
                line: {connectNulls: true}
            }
        };
        
    },
    _getAssociatedPortfolioItems: function(tags){
        this.logger.log('_getAssociatedPortfolioItems', tags);
        var deferred = Ext.create('Deft.Deferred');
        
        Ext.create('Rally.data.lookback.SnapshotStore', {
            listeners: {
                load: function(store, data, success) {
                    if (success) {
                        //Now parse through the data to get the portfolio item object ids that we want
                        var portfolio_item_ids = [];
                        Ext.each(data, function(d){
                            portfolio_item_ids.push(d.get('ObjectID'));
                        },this);
                        deferred.resolve(portfolio_item_ids);
                    } else {
                        deferred.reject('Error getting associated Portfolio Items', success);
                    }
                }
            },
            autoLoad: true,
            fetch: ['ObjectID', 'Name','_ItemHierarchy','_TypeHierarchy'],
            find: {
                _TypeHierarchy: {$in: this.portfolioItemTypes},
                Tags: {$in: tags},
                __At: "current"  //Note: This gets only items that have these tags today
            }
        });
        return deferred; 
    },

    _getTagObjectIDs: function(){
        var tag_objects = this.down('#tag-picker').getValue(); 
        var tags = [];
        Ext.each(tag_objects, function(to){
            tags.push(to.get('ObjectID'));
        },this);
        return tags; 
    },
    _getStoreConfig: function(portfolioItemObjectIds){
        this.logger.log('_getStoreConfig', portfolioItemObjectIds);
        return {
            find: {
                _TypeHierarchy: 'HierarchicalRequirement',
                Children: null,
                _ProjectHierarchy: this.getContext().getProject().ObjectID,
                _ItemHierarchy: {$in: portfolioItemObjectIds}
             },
            fetch: ['ScheduleState','PlanEstimate','_TypeHierarchy','_ValidTo','_ValidFrom'],
            hydrate: ['ScheduleState','_TypeHierarchy'],
            compress: true,
            sort: {
                _ValidFrom: 1
            },
            context: this.getContext().getDataContext(),
            limit: Infinity
        };
    }
});